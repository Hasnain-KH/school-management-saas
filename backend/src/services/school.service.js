import mongoose from "mongoose";
import School from "../models/school.model.js";
import SubscriptionPlan from "../models/subscription-plan.model.js";
import Student from "../models/student.model.js";
import User from "../models/user.model.js";
import { writeAuditLog } from "../utils/audit.js";

export const getSchoolProfile = (req) => School.findById(req.school._id);

export const getSchoolSubscriptionSummary = async (req) => {
    if (!req.school?._id || String(req.school._id) !== String(req.user?.schoolId)) {
        return null;
    }
    const school = await School.findOne({ _id: req.school._id }).lean();
    if (!school) return null;
    const plan = school.subscription?.planId
        ? await SubscriptionPlan.findById(school.subscription.planId).lean()
        : school.subscription?.plan
            ? await SubscriptionPlan.findOne({ code: school.subscription.plan }).lean()
            : null;
    const [students, staff] = await Promise.all([
        Student.countDocuments({ schoolId: school._id }),
        User.countDocuments({
            schoolId: school._id,
            role: { $in: ["school_admin", "principal", "teacher"] },
            status: "active"
        })
    ]);
    return {
        status: school.status,
        subscription: school.subscription,
        plan: plan ? {
            name: plan.name,
            code: plan.code,
            priceMinor: plan.priceMinor,
            currency: plan.currency,
            billingInterval: plan.billingInterval,
            limits: plan.limits,
            features: plan.features
        } : null,
        usage: { students, staff, branches: school.branches.length },
        asOf: new Date()
    };
};

export const updateSchoolProfile = async (req, input) => {
    const updates = {};
    for (const key of ["name", "phone"]) {
        if (input[key] !== undefined) {
            updates[key] = input[key];
        }
    }
    if (input.address) {
        for (const [key, value] of Object.entries(input.address)) {
            updates[`address.${key}`] = value;
        }
    }
    if (input.settings?.attendanceLateGraceMinutes !== undefined) {
        updates["settings.attendanceLateGraceMinutes"] = input.settings.attendanceLateGraceMinutes;
    }
    if (input.settings?.attendanceStartTime !== undefined) {
        updates["settings.attendanceStartTime"] = input.settings.attendanceStartTime;
    }

    const session = await mongoose.startSession();
    let school;
    try {
        await session.withTransaction(async () => {
            school = await School.findOneAndUpdate(
                { _id: req.school._id },
                { $set: updates },
                { new: true, runValidators: true, session }
            );
            if (school) {
                await writeAuditLog({
                    schoolId: school._id,
                    actorUserId: req.user._id,
                    action: "school.profile.updated",
                    resourceType: "school",
                    resourceId: school._id,
                    metadata: { fields: Object.keys(input) },
                    session
                });
            }
        });
    } finally {
        await session.endSession();
    }
    return school;
};
