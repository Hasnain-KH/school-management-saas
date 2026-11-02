import AuditLog from "../models/audit-log.model.js";
import FixedAsset from "../models/fixed-asset.model.js";
import FixedAssetAssignment from "../models/fixed-asset-assignment.model.js";
import FixedAssetDepreciation from "../models/fixed-asset-depreciation.model.js";
import Student from "../models/student.model.js";
import User from "../models/user.model.js";
import { HttpError } from "../utils/http-error.js";
import { withTransaction } from "../utils/transaction.js";

const assertTenant = (req) => {
    if (!req.user?.schoolId || !req.school
        || String(req.user.schoolId) !== String(req.school._id)) {
        throw new HttpError(403, "A matching school tenant context is required");
    }
    return req.user.schoolId;
};

const pageResult = (page, limit, total) => ({ page, limit, total, pages: Math.ceil(total / limit) });

const audit = async (req, session, action, resourceId, metadata = {}) => {
    await new AuditLog({
        schoolId: assertTenant(req),
        actorUserId: req.user._id,
        action,
        resourceType: "fixed_asset",
        resourceId,
        metadata
    }).save({ session });
};

export const createFixedAsset = async (req, input) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const asset = new FixedAsset({
            ...input,
            schoolId,
            assetTag: input.assetTag.toUpperCase(),
            createdBy: req.user._id
        });
        try {
            await asset.save({ session });
        } catch (error) {
            if (error?.code === 11000) throw new HttpError(409, "Asset tag already exists in this school");
            throw error;
        }
        await audit(req, session, "fixed_asset.created", asset._id, {
            costMinor: asset.costMinor,
            currency: asset.currency
        });
        return asset.toObject();
    });
};

export const listFixedAssets = async (req, input) => {
    const schoolId = assertTenant(req);
    const page = input.page ?? 1;
    const limit = input.limit ?? 25;
    const filter = {
        schoolId,
        ...(input.category && { category: input.category }),
        ...(input.status && { status: input.status })
    };
    const [items, total] = await Promise.all([
        FixedAsset.find(filter).sort({ name: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
        FixedAsset.countDocuments(filter)
    ]);
    return { items, pagination: pageResult(page, limit, total) };
};

const latestAssignmentEvent = async (schoolId, assetId, session) => {
    let query = FixedAssetAssignment.findOne({ schoolId, assetId }).sort({ occurredAt: -1, _id: -1 });
    if (session) query = query.session(session);
    return query.lean();
};

export const assignFixedAsset = async (req, assetId, input) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const asset = await FixedAsset.findOneAndUpdate(
            { _id: assetId, schoolId, status: "active" },
            { $inc: { assignmentRevision: 1 } },
            { new: true, session }
        );
        if (!asset) throw new HttpError(404, "Active asset was not found in this school");
        const lastEvent = await latestAssignmentEvent(schoolId, assetId, session);
        if (lastEvent?.action === "assigned") {
            throw new HttpError(409, "Asset is already assigned; release it before assigning it again");
        }
        const assignee = input.assigneeType === "student"
            ? await Student.findOne({ _id: input.assigneeId, schoolId, status: "enrolled" }).session(session)
            : await User.findOne({
                _id: input.assigneeId,
                schoolId,
                status: "active",
                role: { $in: ["school_admin", "principal", "teacher"] }
            }).session(session);
        if (!assignee) throw new HttpError(404, "Active assignee was not found in this school");
        const entry = new FixedAssetAssignment({
            schoolId,
            assetId: asset._id,
            action: "assigned",
            assigneeType: input.assigneeType,
            assigneeId: assignee._id,
            note: input.note,
            actorUserId: req.user._id
        });
        await entry.save({ session });
        await audit(req, session, "fixed_asset.assigned", asset._id, {
            assigneeType: input.assigneeType,
            assigneeId: assignee._id
        });
        return entry.toObject();
    });
};

export const releaseFixedAsset = async (req, assetId, input = {}) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const asset = await FixedAsset.findOneAndUpdate(
            { _id: assetId, schoolId, status: "active" },
            { $inc: { assignmentRevision: 1 } },
            { new: true, session }
        );
        if (!asset) throw new HttpError(404, "Active asset was not found in this school");
        const lastEvent = await latestAssignmentEvent(schoolId, assetId, session);
        if (!lastEvent || lastEvent.action !== "assigned") {
            throw new HttpError(409, "Asset is not currently assigned");
        }
        const entry = new FixedAssetAssignment({
            schoolId,
            assetId: asset._id,
            action: "released",
            assigneeType: lastEvent.assigneeType,
            assigneeId: lastEvent.assigneeId,
            note: input.note,
            actorUserId: req.user._id
        });
        await entry.save({ session });
        await audit(req, session, "fixed_asset.released", asset._id, {
            assigneeType: lastEvent.assigneeType,
            assigneeId: lastEvent.assigneeId
        });
        return entry.toObject();
    });
};

const periodIndex = (period) => {
    const [year, month] = period.split("-").map(Number);
    return year * 12 + month - 1;
};

export const recordAssetDepreciation = async (req, assetId, input) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const asset = await FixedAsset.findOne({ _id: assetId, schoolId, status: "active" }).session(session);
        if (!asset) throw new HttpError(404, "Active asset was not found in this school");
        const acquiredPeriod = `${asset.acquisitionDate.toISOString().slice(0, 7)}`;
        if (periodIndex(input.period) < periodIndex(acquiredPeriod)
            || periodIndex(input.period) > periodIndex(new Date().toISOString().slice(0, 7))) {
            throw new HttpError(400, "Depreciation period must be between acquisition month and current month");
        }
        const previous = await FixedAssetDepreciation.findOne({
            schoolId,
            assetId: asset._id
        }).sort({ period: -1 }).session(session).lean();
        const expectedPeriodIndex = previous
            ? periodIndex(previous.period) + 1
            : periodIndex(acquiredPeriod);
        if (periodIndex(input.period) !== expectedPeriodIndex) {
            throw new HttpError(409, previous
                ? `Record depreciation for ${nextPeriod(previous.period)} before this period`
                : `The first depreciation period is ${acquiredPeriod}`);
        }

        const monthsElapsed = periodIndex(input.period) - periodIndex(acquiredPeriod) + 1;
        const depreciableCost = asset.costMinor - asset.salvageValueMinor;
        const accumulatedMinor = Math.min(
            depreciableCost,
            Math.round(depreciableCost * Math.min(monthsElapsed, asset.usefulLifeMonths) / asset.usefulLifeMonths)
        );
        const amountMinor = accumulatedMinor - (previous?.accumulatedMinor ?? 0);
        const entry = new FixedAssetDepreciation({
            schoolId,
            assetId: asset._id,
            period: input.period,
            amountMinor,
            accumulatedMinor,
            actorUserId: req.user._id
        });
        try {
            await entry.save({ session });
        } catch (error) {
            if (error?.code === 11000) throw new HttpError(409, "Depreciation was already recorded for this period");
            throw error;
        }
        await audit(req, session, "fixed_asset.depreciated", asset._id, {
            period: input.period,
            amountMinor,
            accumulatedMinor
        });
        return entry.toObject();
    });
};

const nextPeriod = (period) => {
    const index = periodIndex(period) + 1;
    const year = Math.floor(index / 12);
    const month = String(index % 12 + 1).padStart(2, "0");
    return `${year}-${month}`;
};

export const getAssetHistory = async (req, assetId, input) => {
    const schoolId = assertTenant(req);
    if (!await FixedAsset.exists({ _id: assetId, schoolId })) {
        throw new HttpError(404, "Asset was not found in this school");
    }
    const [assignments, depreciation] = await Promise.all([
        FixedAssetAssignment.find({ schoolId, assetId }).sort({ occurredAt: -1 }).limit(100).lean(),
        FixedAssetDepreciation.find({ schoolId, assetId }).sort({ period: -1 }).limit(120).lean()
    ]);
    return { assignments, depreciation, page: input.page ?? 1 };
};

export const disposeFixedAsset = async (req, assetId) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const asset = await FixedAsset.findOneAndUpdate(
            { _id: assetId, schoolId, status: "active" },
            { $set: { status: "disposed" }, $inc: { assignmentRevision: 1 } },
            { new: true, session }
        );
        if (!asset) throw new HttpError(404, "Active asset was not found in this school");
        const lastEvent = await latestAssignmentEvent(schoolId, assetId, session);
        if (lastEvent?.action === "assigned") throw new HttpError(409, "Release the asset before disposal");
        await audit(req, session, "fixed_asset.disposed", asset._id);
        return asset.toObject();
    });
};
