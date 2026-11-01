import AuditLog from "../models/audit-log.model.js";
import User from "../models/user.model.js";
import { HttpError } from "../utils/http-error.js";
import { tenantFilter } from "../middleware/authorization.middleware.js";
import { withTransaction } from "../utils/transaction.js";
import { assertPlanCapacity } from "../utils/plan-limits.js";

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const listUsers = async (req, input) => {
    const filter = tenantFilter(req, {
        ...(input.role && { role: input.role }),
        ...(input.status && { status: input.status })
    });
    if (input.search) {
        const pattern = new RegExp(escapeRegex(input.search), "i");
        filter.$or = [{ name: pattern }, { email: pattern }];
    }

    const page = input.page ?? 1;
    const limit = input.limit ?? 25;
    const [items, total] = await Promise.all([
        User.find(filter)
            .sort({ name: 1, _id: 1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        User.countDocuments(filter)
    ]);

    return {
        items: items.map(({ _id, schoolId, name, email, phone, jobTitle, role, status, createdAt }) => ({
            id: _id.toString(),
            schoolId: schoolId.toString(),
            name,
            email,
            phone,
            jobTitle,
            role,
            status,
            createdAt
        })),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    };
};

export const createUser = async (req, input) => {
    const schoolId = req.user.schoolId;
    if (!schoolId || String(req.school?._id) !== String(schoolId)) {
        throw new HttpError(403, "A matching school tenant context is required");
    }

    return withTransaction(async (session) => {
        if (["school_admin", "principal", "teacher"].includes(input.role)) {
            await assertPlanCapacity(req, session, "staff");
        }
        const user = new User({
            schoolId,
            name: input.name,
            email: input.email,
            phone: input.phone,
            jobTitle: input.jobTitle,
            role: input.role,
            passwordHash: input.password,
            status: "active"
        });
        await user.save({ session });
        const audit = new AuditLog({
            schoolId,
            actorUserId: req.user._id,
            action: "user.created",
            resourceType: "user",
            resourceId: user._id,
            metadata: { role: user.role }
        });
        await audit.save({ session });
        return user;
    });
};

export const updateUser = async (req, userId, input) => {
    const schoolId = req.user.schoolId;
    if (!schoolId || String(req.school?._id) !== String(schoolId)) {
        throw new HttpError(403, "A matching school tenant context is required");
    }
    if (String(req.user._id) === String(userId) && input.status === "disabled") {
        throw new HttpError(409, "You cannot disable your own account");
    }

    return withTransaction(async (session) => {
        const user = await User.findOne({
            _id: userId,
            schoolId,
            role: { $ne: "platform_super_admin" }
        }).session(session);
        if (!user) {
            throw new HttpError(404, "User was not found in this school");
        }
        if (input.status === "active"
            && user.status !== "active"
            && ["school_admin", "principal", "teacher"].includes(user.role)) {
            await assertPlanCapacity(req, session, "staff");
        }
        for (const [field, value] of Object.entries(input)) user.set(field, value);
        await user.save({ session });

        const audit = new AuditLog({
            schoolId,
            actorUserId: req.user._id,
            action: "user.updated",
            resourceType: "user",
            resourceId: user._id,
            metadata: { fields: Object.keys(input) }
        });
        await audit.save({ session });
        return user;
    });
};
