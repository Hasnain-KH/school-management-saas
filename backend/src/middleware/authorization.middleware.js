import { HttpError } from "../utils/http-error.js";

const permissionsByRole = {
    platform_super_admin: new Set(["platform:manage"]),
    school_admin: new Set([
        "school:read", "school:update", "users:manage", "audit:read",
        "academic:read", "academic:manage", "students:read", "students:manage",
        "attendance:read", "attendance:manage"
    ]),
    principal: new Set([
        "school:read", "academic:read", "academic:manage",
        "students:read", "students:manage", "attendance:read", "attendance:manage", "reports:read"
    ]),
    teacher: new Set(["school:read", "academic:read", "attendance:read", "attendance:manage"]),
    parent: new Set(["school:read", "student:read", "notifications:read"])
};

export const hasPermission = (role, permission) =>
    permissionsByRole[role]?.has(permission) ?? false;

export const requireRoles = (...roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
        return next(new HttpError(403, "You do not have permission to perform this action"));
    }
    return next();
};

export const requirePermission = (permission) => (req, res, next) => {
    if (!req.user || !hasPermission(req.user.role, permission)) {
        return next(new HttpError(403, "You do not have permission to perform this action"));
    }
    return next();
};

export const requireTenant = (req, res, next) => {
    if (!req.school || !req.user?.schoolId || String(req.school._id) !== String(req.user.schoolId)) {
        return next(new HttpError(403, "A school tenant context is required"));
    }
    return next();
};

export const tenantFilter = (req, filter = {}) => {
    if (!req.school || !req.user?.schoolId || String(req.school._id) !== String(req.user.schoolId)) {
        throw new HttpError(403, "A school tenant context is required");
    }
    return { ...filter, schoolId: req.school._id };
};
