import School from "../models/school.model.js";
import Student from "../models/student.model.js";
import SubscriptionPlan from "../models/subscription-plan.model.js";
import User from "../models/user.model.js";
import { HttpError } from "./http-error.js";

const resourceFilters = {
    students: { model: Student, filter: { status: "enrolled" } },
    staff: {
        model: User,
        filter: { status: "active", role: { $in: ["school_admin", "principal", "teacher"] } }
    }
};

export const assertPlanCapacity = async (req, session, resource) => {
    if (!Object.hasOwn(req, "subscriptionPlan")) return;
    const schoolId = req.school?._id;
    if (!schoolId || !req.subscriptionPlan?._id) {
        throw new HttpError(403, "The school does not have an active subscription plan");
    }

    const lock = await School.updateOne(
        { _id: schoolId },
        { $inc: { "subscription.limitRevision": 1 } },
        { session }
    );
    if (lock.modifiedCount !== 1) throw new HttpError(404, "School was not found");

    const plan = await SubscriptionPlan.findById(req.subscriptionPlan._id).session(session).lean();
    if (!plan) throw new HttpError(409, "The school's subscription plan is no longer available");
    const limit = plan.limits?.[resource];
    if (limit === null || limit === undefined) return;

    let used;
    if (resource === "branches") {
        const school = await School.findById(schoolId).session(session).select("branches");
        used = school?.branches.length ?? 0;
    } else {
        const config = resourceFilters[resource];
        if (!config) throw new Error(`Unsupported plan limit: ${resource}`);
        used = await config.model.countDocuments({ schoolId, ...config.filter }).session(session);
    }
    if (used >= limit) {
        throw new HttpError(409, `The ${resource} limit for the current subscription plan has been reached`);
    }
};
