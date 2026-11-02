import FeeReminderDelivery from "../models/fee-reminder-delivery.model.js";
import FeeVoucher from "../models/fee-voucher.model.js";
import Guardian from "../models/guardian.model.js";
import StudentGuardian from "../models/student-guardian.model.js";
import { getFeeReminderProvider } from "./email-delivery.provider.js";
import { HttpError } from "../utils/http-error.js";

const assertTenant = (req) => {
    if (!req.user?.schoolId || !req.school
        || String(req.user.schoolId) !== String(req.school._id)) {
        throw new HttpError(403, "A matching school tenant context is required");
    }
    return req.user.schoolId;
};

export const dispatchOverdueFeeReminders = async (req, input = {}) => {
    const schoolId = assertTenant(req);
    const provider = getFeeReminderProvider();
    const asOf = input.asOf ? new Date(`${input.asOf}T23:59:59.999Z`) : new Date();
    const reminderDate = asOf.toISOString().slice(0, 10);
    const vouchers = await FeeVoucher.find({
        schoolId,
        balanceMinor: { $gt: 0 },
        dueDate: { $lt: new Date(`${reminderDate}T00:00:00.000Z`) }
    }).select("_id studentId period dueDate currency balanceMinor").limit(input.limit ?? 250).lean();

    const result = { examined: vouchers.length, sent: 0, skipped: 0, failed: 0 };
    const failures = [];
    for (const voucher of vouchers) {
        const links = await StudentGuardian.find({ schoolId, studentId: voucher.studentId })
            .select("guardianId").lean();
        if (!links.length) {
            result.skipped += 1;
            continue;
        }
        const guardians = await Guardian.find({
            schoolId,
            _id: { $in: links.map(({ guardianId }) => guardianId) },
            isActive: true,
            email: { $type: "string", $ne: "" }
        }).select("_id name email").lean();
        for (const guardian of guardians) {
            const claimUntil = new Date(Date.now() + 2 * 60 * 1000);
            let delivery = await FeeReminderDelivery.findOneAndUpdate(
                {
                    schoolId,
                    voucherId: voucher._id,
                    guardianId: guardian._id,
                    reminderDate,
                    $or: [
                        { status: "failed" },
                        { status: "pending", leaseExpiresAt: { $lt: new Date() } }
                    ]
                },
                {
                    $set: { status: "pending", lastAttemptAt: new Date(), leaseExpiresAt: claimUntil, lastErrorCode: null },
                    $inc: { attempts: 1 }
                },
                { new: true, runValidators: true }
            );
            if (!delivery) {
                delivery = new FeeReminderDelivery({
                    schoolId,
                    voucherId: voucher._id,
                    guardianId: guardian._id,
                    reminderDate,
                    status: "pending",
                    attempts: 1,
                    lastAttemptAt: new Date(),
                    leaseExpiresAt: claimUntil
                });
            }
            try {
                if (delivery.isNew) await delivery.save();
            } catch (error) {
                if (error?.code === 11000) {
                    result.skipped += 1;
                    continue;
                }
                throw error;
            }

            try {
                await provider.sendOverdueFeeReminder({
                    to: guardian.email,
                    guardianName: guardian.name,
                    period: voucher.period,
                    dueDate: voucher.dueDate,
                    balanceMinor: voucher.balanceMinor,
                    currency: voucher.currency,
                    idempotencyKey: `${schoolId}:${voucher._id}:${guardian._id}:${reminderDate}`
                });
                delivery.status = "sent";
                delivery.sentAt = new Date();
                delivery.leaseExpiresAt = undefined;
                delivery.lastErrorCode = undefined;
                await delivery.save();
                result.sent += 1;
            } catch (error) {
                delivery.status = "failed";
                delivery.leaseExpiresAt = undefined;
                delivery.lastErrorCode = String(error?.code || error?.name || "PROVIDER_ERROR").slice(0, 60);
                await delivery.save();
                result.failed += 1;
                failures.push({ voucherId: String(voucher._id), guardianId: String(guardian._id), code: delivery.lastErrorCode });
            }
        }
    }
    return { ...result, failures };
};
