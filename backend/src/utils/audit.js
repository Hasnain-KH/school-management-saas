import AuditLog from "../models/audit-log.model.js";

export const writeAuditLog = async ({
    schoolId,
    actorUserId,
    action,
    resourceType,
    resourceId,
    metadata = {},
    session
}) => {
    const log = new AuditLog({
        schoolId,
        actorUserId,
        action,
        resourceType,
        resourceId,
        metadata
    });

    await log.save({ session });
};
