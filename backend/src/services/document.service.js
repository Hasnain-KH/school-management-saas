import { randomUUID, createHash } from "node:crypto";
import AuditLog from "../models/audit-log.model.js";
import SchoolDocument from "../models/document.model.js";
import Student from "../models/student.model.js";
import User from "../models/user.model.js";
import { getDocumentStorageProvider } from "./document-storage.provider.js";
import { getLinkedStudentIds } from "./parent-portal.service.js";
import { HttpError } from "../utils/http-error.js";
import { withTransaction } from "../utils/transaction.js";

const assertTenant = (req) => {
    if (!req.user?.schoolId || !req.school
        || String(req.user.schoolId) !== String(req.school._id)) {
        throw new HttpError(403, "A matching school tenant context is required");
    }
    return req.user.schoolId;
};

const pageInfo = (page, limit, total) => ({ page, limit, total, pages: Math.ceil(total / limit) });

const writeAudit = async (req, session, action, resourceId, metadata = {}) => {
    const log = new AuditLog({
        schoolId: assertTenant(req),
        actorUserId: req.user._id,
        action,
        resourceType: "document",
        resourceId,
        metadata
    });
    await log.save({ session });
};

const sanitizeFileName = (name) => name.replace(/[^\w.\-]+/g, "_").slice(-120);

const publicDocument = (document) => ({
    id: String(document._id),
    title: document.title,
    category: document.category,
    studentId: document.studentId ? String(document.studentId) : null,
    subjectUserId: document.subjectUserId ? String(document.subjectUserId) : null,
    fileName: document.fileName,
    contentType: document.contentType,
    sizeBytes: document.sizeBytes,
    uploadedBy: String(document.uploadedBy),
    createdAt: document.createdAt
});

// Parents may only ever see documents that belong to their explicitly linked children.
const parentStudentScope = async (req, schoolId) => {
    if (req.user.role !== "parent") return null;
    return getLinkedStudentIds(schoolId, req.user._id);
};

export const createDocument = async (req, input) => {
    const schoolId = assertTenant(req);
    const storage = getDocumentStorageProvider();
    const buffer = Buffer.from(input.dataBase64, "base64");
    if (!buffer.length) throw new HttpError(400, "The uploaded file is empty");

    if (input.studentId) {
        const student = await Student.exists({ _id: input.studentId, schoolId });
        if (!student) throw new HttpError(404, "The referenced student was not found in this school");
    }
    if (input.subjectUserId) {
        const subjectUser = await User.exists({ _id: input.subjectUserId, schoolId });
        if (!subjectUser) throw new HttpError(404, "The referenced staff member was not found in this school");
    }

    const storageKey = `${schoolId}/${input.category}/${randomUUID()}-${sanitizeFileName(input.fileName)}`;
    await storage.upload({ key: storageKey, body: buffer, contentType: input.contentType });

    try {
        return await withTransaction(async (session) => {
            const document = new SchoolDocument({
                schoolId,
                title: input.title,
                category: input.category,
                studentId: input.studentId ?? null,
                subjectUserId: input.subjectUserId ?? null,
                fileName: input.fileName,
                contentType: input.contentType,
                sizeBytes: buffer.length,
                storageKey,
                checksum: createHash("sha256").update(buffer).digest("hex"),
                uploadedBy: req.user._id
            });
            await document.save({ session });
            await writeAudit(req, session, "document.uploaded", document._id, {
                category: document.category,
                sizeBytes: document.sizeBytes
            });
            return publicDocument(document);
        });
    } catch (error) {
        // Never leave an orphaned object in storage if the metadata write fails.
        await storage.delete({ key: storageKey }).catch(() => {});
        throw error;
    }
};

export const listDocuments = async (req, input) => {
    const schoolId = assertTenant(req);
    const filter = { schoolId, isActive: true };
    if (input.category) filter.category = input.category;
    if (input.studentId) filter.studentId = input.studentId;

    const parentScope = await parentStudentScope(req, schoolId);
    if (parentScope) {
        const scoped = input.studentId
            ? parentScope.filter((id) => id === String(input.studentId))
            : parentScope;
        if (!scoped.length) {
            return { items: [], pagination: pageInfo(input.page ?? 1, input.limit ?? 25, 0) };
        }
        filter.studentId = { $in: scoped };
    }

    const page = input.page ?? 1;
    const limit = input.limit ?? 25;
    const [items, total] = await Promise.all([
        SchoolDocument.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        SchoolDocument.countDocuments(filter)
    ]);
    return { items: items.map(publicDocument), pagination: pageInfo(page, limit, total) };
};

const findAccessibleDocument = async (req, id) => {
    const schoolId = assertTenant(req);
    const document = await SchoolDocument.findOne({ _id: id, schoolId, isActive: true });
    if (!document) throw new HttpError(404, "Document was not found");
    const parentScope = await parentStudentScope(req, schoolId);
    if (parentScope && (!document.studentId || !parentScope.includes(String(document.studentId)))) {
        throw new HttpError(403, "You do not have access to this document");
    }
    return document;
};

export const getDocumentDownloadUrl = async (req, id) => {
    const storage = getDocumentStorageProvider();
    const document = await findAccessibleDocument(req, id);
    const url = await storage.createDownloadUrl({ key: document.storageKey });
    return { id: String(document._id), fileName: document.fileName, url };
};

export const deleteDocument = async (req, id) => {
    const storage = getDocumentStorageProvider();
    const document = await findAccessibleDocument(req, id);
    await withTransaction(async (session) => {
        document.isActive = false;
        await document.save({ session });
        await writeAudit(req, session, "document.deleted", document._id, { category: document.category });
    });
    await storage.delete({ key: document.storageKey }).catch(() => {});
    return { id: String(document._id), deleted: true };
};
