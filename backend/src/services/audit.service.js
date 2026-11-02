import AuditLog from "../models/audit-log.model.js";
import { HttpError } from "../utils/http-error.js";

const assertTenant = (req) => {
    if (!req.user?.schoolId || !req.school
        || String(req.user.schoolId) !== String(req.school._id)) {
        throw new HttpError(403, "A matching school tenant context is required");
    }
    return req.school._id;
};

const rangeFilter = (input) => {
    const filter = {};
    if (input.from || input.to) {
        filter.createdAt = {
            ...(input.from && { $gte: new Date(`${input.from}T00:00:00.000Z`) }),
            ...(input.to && { $lte: new Date(`${input.to}T23:59:59.999Z`) })
        };
    }
    if (input.search) {
        const escaped = input.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        filter.$or = [
            { action: new RegExp(escaped, "i") },
            { resourceType: new RegExp(escaped, "i") }
        ];
    }
    return filter;
};

const listEvents = async (filter, input) => {
    const page = input.page ?? 1;
    const limit = input.limit ?? 25;
    const [items, total] = await Promise.all([
        AuditLog.find(filter).sort({ createdAt: -1, _id: -1 })
            .skip((page - 1) * limit).limit(limit)
            .select("actorUserId action resourceType resourceId metadata createdAt")
            .lean(),
        AuditLog.countDocuments(filter)
    ]);
    return { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
};

export const listSchoolAuditEvents = (req, input) => {
    const schoolId = assertTenant(req);
    return listEvents({
        schoolId,
        ...rangeFilter(input),
        ...(input.action && { action: input.action }),
        ...(input.resourceType && { resourceType: input.resourceType })
    }, input);
};

export const listPlatformAuditEvents = (input) =>
    listEvents({
        schoolId: null,
        ...rangeFilter(input),
        ...(input.action && { action: input.action }),
        ...(input.resourceType && { resourceType: input.resourceType })
    }, input);
