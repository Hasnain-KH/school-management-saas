import Notification from "../models/notification.model.js";
import User from "../models/user.model.js";
import { HttpError } from "../utils/http-error.js";

const assertTenant = (req) => {
    if (!req.user?.schoolId || !req.school
        || String(req.user.schoolId) !== String(req.school._id)) {
        throw new HttpError(403, "A matching school tenant context is required");
    }
    return req.user.schoolId;
};

const publicNotification = (notification) => ({
    id: String(notification._id),
    type: notification.type,
    title: notification.title,
    body: notification.body,
    data: notification.data ?? {},
    read: Boolean(notification.readAt),
    readAt: notification.readAt ?? null,
    createdAt: notification.createdAt
});

// Idempotent when a dedupeKey is supplied: repeated events never create duplicates.
export const createNotification = async ({
    schoolId, userId, type, title, body, data = {}, dedupeKey = null
}) => {
    if (!schoolId || !userId || !type || !title || !body) return null;
    if (dedupeKey) {
        return Notification.findOneAndUpdate(
            { schoolId, userId, dedupeKey },
            { $setOnInsert: { schoolId, userId, type, title, body, data, dedupeKey } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
    }
    return Notification.create({ schoolId, userId, type, title, body, data });
};

export const createNotificationsForRoles = async ({
    schoolId, roles, type, title, body, data = {}, dedupeKey = null
}) => {
    if (!schoolId || !Array.isArray(roles) || !roles.length) return { created: 0 };
    const recipients = await User.find({ schoolId, role: { $in: roles }, status: "active" })
        .select("_id").lean();
    return insertForUserIds({
        schoolId,
        userIds: recipients.map(({ _id }) => _id),
        type,
        title,
        body,
        data,
        dedupeKey
    });
};

// Creates the same notification for an explicit set of user ids (used for
// targeted events such as "results published for your child's class").
export const createNotificationsForUserIds = async ({
    schoolId, userIds, type, title, body, data = {}, dedupeKey = null
}) => {
    if (!schoolId || !Array.isArray(userIds) || !userIds.length) return { created: 0 };
    return insertForUserIds({ schoolId, userIds, type, title, body, data, dedupeKey });
};

const insertForUserIds = async ({ schoolId, userIds, type, title, body, data, dedupeKey }) => {
    if (!schoolId || !type || !title || !body || !userIds.length) return { created: 0 };
    const uniqueIds = [...new Set(userIds.map((id) => String(id)))];
    if (dedupeKey) {
        const operations = uniqueIds.map((id) => ({
            updateOne: {
                filter: { schoolId, userId: id, dedupeKey },
                update: { $setOnInsert: { schoolId, userId: id, type, title, body, data, dedupeKey } },
                upsert: true
            }
        }));
        const result = await Notification.bulkWrite(operations, { ordered: false });
        return { created: result.upsertedCount ?? 0 };
    }

    const docs = uniqueIds.map((id) => ({ schoolId, userId: id, type, title, body, data }));
    const inserted = await Notification.insertMany(docs);
    return { created: inserted.length };
};

export const listNotifications = async (req, input) => {
    const schoolId = assertTenant(req);
    const filter = { schoolId, userId: req.user._id };
    if (input.unreadOnly) filter.readAt = null;
    const page = input.page ?? 1;
    const limit = input.limit ?? 25;
    const [items, total] = await Promise.all([
        Notification.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        Notification.countDocuments(filter)
    ]);
    return {
        items: items.map(publicNotification),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    };
};

export const getUnreadCount = async (req) => {
    const schoolId = assertTenant(req);
    const count = await Notification.countDocuments({ schoolId, userId: req.user._id, readAt: null });
    return { unread: count };
};

export const markNotificationRead = async (req, notificationId) => {
    const schoolId = assertTenant(req);
    const notification = await Notification.findOneAndUpdate(
        { _id: notificationId, schoolId, userId: req.user._id, readAt: null },
        { $set: { readAt: new Date() } },
        { new: true }
    );
    if (!notification) {
        const exists = await Notification.exists({ _id: notificationId, schoolId, userId: req.user._id });
        if (!exists) throw new HttpError(404, "Notification was not found");
        return { id: String(notificationId), read: true };
    }
    return publicNotification(notification);
};

export const markAllNotificationsRead = async (req) => {
    const schoolId = assertTenant(req);
    const result = await Notification.updateMany(
        { schoolId, userId: req.user._id, readAt: null },
        { $set: { readAt: new Date() } }
    );
    return { updated: result.modifiedCount };
};
