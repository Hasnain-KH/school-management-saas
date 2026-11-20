import { randomUUID, createHash } from "node:crypto";
import School from "../models/school.model.js";
import { getDocumentStorageProvider, getDocumentStorageProviderName } from "./document-storage.provider.js";
import { writeAuditLog } from "../utils/audit.js";
import { withTransaction } from "../utils/transaction.js";
import { HttpError } from "../utils/http-error.js";
import { SCHOOL_LOGO_MAX_BYTES, toPublicLogo } from "../utils/school-logo.js";
import { detectImageMime } from "../validators/school-logo.validator.js";

// The school identity is ALWAYS derived from the authenticated session. No
// client-supplied schoolId is ever read by this service.
const assertTenant = (req) => {
    if (!req.user?.schoolId || !req.school
        || String(req.user.schoolId) !== String(req.school._id)) {
        throw new HttpError(403, "A matching school tenant context is required");
    }
    return req.user.schoolId;
};

const assertSchoolAdmin = (req) => {
    if (req.user?.role !== "school_admin") {
        throw new HttpError(403, "Only a school administrator can manage the school logo");
    }
    return assertTenant(req);
};

const sanitizeFileName = (name) => name.replace(/[^\w.\-]+/g, "_").slice(-120);

export const uploadSchoolLogo = async (req, input) => {
    const schoolId = assertSchoolAdmin(req);
    const providerName = getDocumentStorageProviderName();
    const storage = getDocumentStorageProvider();

    const buffer = Buffer.from(input.dataBase64, "base64");
    if (!buffer.length || buffer.length > SCHOOL_LOGO_MAX_BYTES) {
        throw new HttpError(400, "Logo must be a non-empty image of at most 2 MB");
    }

    // Declared MIME and real bytes must agree. This rejects a renamed SVG,
    // HTML file or script even when the client labels it image/png.
    const detected = detectImageMime(buffer);
    if (!detected || detected !== input.contentType) {
        throw new HttpError(400, "The file content is not a supported PNG, JPG, JPEG or WebP image");
    }

    const storageKey = `logos/${schoolId}/${randomUUID()}-${sanitizeFileName(input.fileName)}`;
    let previousKey = null;
    let previousProvider = null;

    // Upload first so a failed database write never leaves the school pointing
    // at an object that does not exist.
    await storage.upload({ key: storageKey, body: buffer, contentType: input.contentType });

    try {
        const logo = await withTransaction(async (session) => {
            const school = await School.findOne({ _id: schoolId }).session(session);
            if (!school) throw new HttpError(404, "School was not found");

            previousKey = school.logo?.storageKey ?? null;
            previousProvider = school.logo?.storageProvider ?? "s3";
            school.logo = {
                storageKey,
                storageProvider: providerName,
                contentType: input.contentType,
                sizeBytes: buffer.length,
                fileName: input.fileName,
                checksum: createHash("sha256").update(buffer).digest("hex"),
                version: (school.logo?.version ?? 0) + 1,
                uploadedBy: req.user._id,
                updatedAt: new Date()
            };
            await school.save({ session });

            await writeAuditLog({
                schoolId,
                actorUserId: req.user._id,
                action: "school.logo.uploaded",
                resourceType: "school",
                resourceId: schoolId,
                metadata: { version: school.logo.version, sizeBytes: buffer.length },
                session
            });
            return toPublicLogo(school.logo);
        });

        // Clean up the replaced asset only after the new metadata is committed.
        // The old asset may belong to a different provider during a migration.
        if (previousKey && previousKey !== storageKey) {
            await getDocumentStorageProvider(previousProvider).delete({ key: previousKey }).catch(() => {});
        }
        return { logo, version: logo.version };
    } catch (error) {
        // Roll back the new object if the transaction failed.
        await getDocumentStorageProvider(providerName).delete({ key: storageKey }).catch(() => {});
        throw error;
    }
};

export const removeSchoolLogo = async (req) => {
    const schoolId = assertSchoolAdmin(req);
    const current = await School.findOne({ _id: schoolId });
    if (!current) throw new HttpError(404, "School was not found");
    const previousKey = current.logo?.storageKey ?? null;
    if (!previousKey) return { removed: false };

    const storage = getDocumentStorageProvider(current.logo?.storageProvider ?? "s3");
    await withTransaction(async (session) => {
        const school = await School.findOne({ _id: schoolId }).session(session);
        if (!school) throw new HttpError(404, "School was not found");
        const previousVersion = school.logo?.version ?? null;
        school.logo = null;
        await school.save({ session });
        await writeAuditLog({
            schoolId,
            actorUserId: req.user._id,
            action: "school.logo.removed",
            resourceType: "school",
            resourceId: schoolId,
            metadata: { version: previousVersion },
            session
        });
    });

    await storage.delete({ key: previousKey }).catch(() => {});
    return { removed: true };
};

// Any authenticated member of the school (teacher, parent, principal, admin)
// may resolve the logo, but only from their own authenticated tenant.
export const getSchoolLogo = async (req) => {
    const schoolId = assertTenant(req);
    const school = await School.findOne({ _id: schoolId });
    if (!school?.logo?.storageKey) throw new HttpError(404, "This school does not have a logo");
    const storage = getDocumentStorageProvider(school.logo.storageProvider ?? "s3");
    return {
        contentType: school.logo.contentType,
        version: school.logo.version ?? 1,
        url: await storage.createDownloadUrl({
            key: school.logo.storageKey,
            contentType: school.logo.contentType
        })
    };
};

export { toPublicLogo };
