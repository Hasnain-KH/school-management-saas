import mongoose from "mongoose";
import School from "../models/school.model.js";
import { writeAuditLog } from "../utils/audit.js";

export const getSchoolProfile = (req) => School.findById(req.school._id);

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
