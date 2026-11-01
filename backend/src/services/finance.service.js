import { randomUUID } from "node:crypto";
import AcademicClass from "../models/academic-class.model.js";
import AcademicSession from "../models/academic-session.model.js";
import AuditLog from "../models/audit-log.model.js";
import FeeCategory from "../models/fee-category.model.js";
import FeePayment from "../models/fee-payment.model.js";
import FeeStructure from "../models/fee-structure.model.js";
import FeeVoucher from "../models/fee-voucher.model.js";
import Student from "../models/student.model.js";
import StudentFeeAssignment from "../models/student-fee-assignment.model.js";
import { HttpError } from "../utils/http-error.js";
import { withTransaction } from "../utils/transaction.js";

const assertTenant = (req) => {
    if (!req.user?.schoolId || !req.school
        || String(req.user.schoolId) !== String(req.school._id)) {
        throw new HttpError(403, "A matching school tenant context is required");
    }
    return req.user.schoolId;
};

const pageResult = (page, limit, total) => ({
    page,
    limit,
    total,
    pages: Math.ceil(total / limit)
});

const writeAudit = async (req, session, action, resourceType, resourceId, metadata = {}) => {
    const audit = new AuditLog({
        schoolId: assertTenant(req),
        actorUserId: req.user._id,
        action,
        resourceType,
        resourceId,
        metadata
    });
    await audit.save({ session });
};

const assertPeriod = (period, frequency) => {
    const annual = /^\d{4}$/.test(period);
    if ((frequency === "annual") !== annual) {
        throw new HttpError(400, `The period format does not match the ${frequency} fee structure`);
    }
};

const dueDateFor = (period, structure) => {
    const [yearText, monthText] = period.split("-");
    const year = Number(yearText);
    const month = structure.frequency === "monthly" ? Number(monthText) : structure.dueMonth;
    return new Date(Date.UTC(year, month - 1, structure.dueDay));
};

const assignedPeriodQuery = (period) => ({
    startPeriod: { $lte: period },
    $or: [{ endPeriod: { $exists: false } }, { endPeriod: null }, { endPeriod: { $gte: period } }]
});

const listPage = async (Model, filter, input, sort) => {
    const page = input.page ?? 1;
    const limit = input.limit ?? 25;
    const [items, total] = await Promise.all([
        Model.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
        Model.countDocuments(filter)
    ]);
    return { items, pagination: pageResult(page, limit, total) };
};

export const createFeeCategory = async (req, input) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const category = new FeeCategory({ ...input, schoolId, code: input.code.toUpperCase() });
        try {
            await category.save({ session });
        } catch (error) {
            if (error?.code === 11000) throw new HttpError(409, "Fee category code already exists");
            throw error;
        }
        await writeAudit(req, session, "fee_category.created", "fee_category", category._id);
        return category.toObject();
    });
};

export const listFeeCategories = async (req, input) => {
    const schoolId = assertTenant(req);
    return listPage(FeeCategory, {
        schoolId,
        ...(input.isActive !== undefined && { isActive: input.isActive })
    }, input, { name: 1, _id: 1 });
};

export const createFeeStructure = async (req, input) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const [academicSession, academicClass, categories] = await Promise.all([
            AcademicSession.findOne({ _id: input.academicSessionId, schoolId }).session(session),
            AcademicClass.findOne({ _id: input.classId, schoolId, isActive: true }).session(session),
            FeeCategory.find({
                _id: { $in: input.lineItems.map((item) => item.categoryId) },
                schoolId,
                isActive: true
            }).session(session)
        ]);
        if (!academicSession || academicSession.status === "completed" || !academicClass) {
            throw new HttpError(404, "Active academic session and class were not found in this school");
        }
        if (categories.length !== input.lineItems.length) {
            throw new HttpError(404, "One or more active fee categories were not found in this school");
        }

        const structure = new FeeStructure({
            ...input,
            schoolId,
            code: input.code.toUpperCase(),
            lineItems: input.lineItems.map((item) => ({
                ...item,
                name: item.name.trim()
            }))
        });
        try {
            await structure.save({ session });
        } catch (error) {
            if (error?.code === 11000) throw new HttpError(409, "Fee structure code already exists for this class/session");
            throw error;
        }
        await writeAudit(req, session, "fee_structure.created", "fee_structure", structure._id);
        return structure.toObject();
    });
};

export const listFeeStructures = async (req, input) => {
    const schoolId = assertTenant(req);
    return listPage(FeeStructure, {
        schoolId,
        ...(input.academicSessionId && { academicSessionId: input.academicSessionId }),
        ...(input.classId && { classId: input.classId }),
        ...(input.isActive !== undefined && { isActive: input.isActive })
    }, input, { name: 1, _id: 1 });
};

export const createStudentFeeAssignment = async (req, input) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const [student, structure] = await Promise.all([
            Student.findOne({ _id: input.studentId, schoolId, status: "enrolled" }).session(session),
            FeeStructure.findOne({ _id: input.feeStructureId, schoolId, isActive: true }).session(session)
        ]);
        if (!student) throw new HttpError(404, "Enrolled student was not found in this school");
        if (!structure) throw new HttpError(404, "Active fee structure was not found in this school");
        if (String(student.academicSessionId) !== String(structure.academicSessionId)
            || String(student.classId) !== String(structure.classId)) {
            throw new HttpError(409, "Fee structure does not apply to the student's current class and session");
        }
        assertPeriod(input.startPeriod, structure.frequency);
        if (input.endPeriod) assertPeriod(input.endPeriod, structure.frequency);
        if (input.endPeriod && input.endPeriod < input.startPeriod) {
            throw new HttpError(400, "End period must not precede start period");
        }
        const gross = structure.lineItems.reduce((sum, item) => sum + item.amountMinor, 0);
        const discount = input.discountAmountMinor
            || Math.round(gross * (input.discountBasisPoints ?? 0) / 10000);
        if (discount >= gross) throw new HttpError(400, "Discount must be less than the fee structure total");

        const assignment = new StudentFeeAssignment({
            ...input,
            schoolId,
            discountAmountMinor: input.discountAmountMinor ?? 0,
            discountBasisPoints: input.discountBasisPoints ?? 0,
            assignedBy: req.user._id
        });
        try {
            await assignment.save({ session });
        } catch (error) {
            if (error?.code === 11000) throw new HttpError(409, "Student is already assigned this fee structure");
            throw error;
        }
        await writeAudit(req, session, "student_fee.assigned", "student_fee_assignment", assignment._id, {
            studentId: student._id,
            feeStructureId: structure._id,
            discountAmountMinor: discount,
            scholarshipName: input.scholarshipName
        });
        return assignment.toObject();
    });
};

export const listStudentFeeAssignments = async (req, input) => {
    const schoolId = assertTenant(req);
    return listPage(StudentFeeAssignment, {
        schoolId,
        ...(input.feeStructureId && { feeStructureId: input.feeStructureId }),
        ...(input.studentId && { studentId: input.studentId }),
        ...(input.isActive !== undefined && { isActive: input.isActive })
    }, input, { createdAt: -1, _id: 1 });
};

export const generateFeeVouchers = async (req, input) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const structure = await FeeStructure.findOne({
            _id: input.feeStructureId,
            schoolId,
            isActive: true
        }).session(session);
        if (!structure) throw new HttpError(404, "Active fee structure was not found in this school");
        assertPeriod(input.period, structure.frequency);
        if (!input.studentIds?.length) {
            throw new HttpError(400, "Select between 1 and 500 students for voucher generation");
        }
        const assignments = await StudentFeeAssignment.find({
            schoolId,
            feeStructureId: structure._id,
            studentId: { $in: input.studentIds },
            isActive: true,
            ...assignedPeriodQuery(input.period)
        }).session(session);
        if (assignments.length !== input.studentIds.length) {
            throw new HttpError(404, "One or more students do not have an active fee assignment for this period");
        }
        const students = await Student.find({
            schoolId,
            _id: { $in: input.studentIds },
            status: "enrolled",
            academicSessionId: structure.academicSessionId,
            classId: structure.classId
        }).session(session).select("_id");
        if (students.length !== input.studentIds.length) {
            throw new HttpError(409, "One or more assigned students are no longer enrolled in the fee structure class");
        }

        let generated = 0;
        let alreadyGenerated = 0;
        try {
            for (const assignment of assignments) {
                const existing = await FeeVoucher.findOne({
                    schoolId,
                    feeAssignmentId: assignment._id,
                    period: input.period
                }).session(session);
                if (existing) {
                    alreadyGenerated += 1;
                    continue;
                }
                const gross = structure.lineItems.reduce((sum, item) => sum + item.amountMinor, 0);
                const discountAmountMinor = assignment.discountAmountMinor
                    || Math.round(gross * assignment.discountBasisPoints / 10000);
                if (discountAmountMinor >= gross) {
                    throw new HttpError(409, "Fee assignment discount exceeds the current fee structure total");
                }
                const amountDueMinor = gross - discountAmountMinor;
                const voucher = new FeeVoucher({
                    schoolId,
                    studentId: assignment.studentId,
                    classId: structure.classId,
                    feeAssignmentId: assignment._id,
                    feeStructureId: structure._id,
                    period: input.period,
                    dueDate: dueDateFor(input.period, structure),
                    currency: structure.currency,
                    lineItems: structure.lineItems,
                    grossAmountMinor: gross,
                    discountAmountMinor,
                    scholarshipName: assignment.scholarshipName,
                    amountDueMinor,
                    paidAmountMinor: 0,
                    balanceMinor: amountDueMinor,
                    status: "unpaid"
                });
                await voucher.save({ session });
                generated += 1;
            }
        } catch (error) {
            if (error?.code === 11000) {
                throw new HttpError(409, "Voucher generation conflicted with another request; retry to confirm existing vouchers");
            }
            throw error;
        }
        await writeAudit(req, session, "fee_vouchers.generated", "fee_voucher", null, {
            feeStructureId: structure._id,
            period: input.period,
            generated,
            alreadyGenerated
        });
        return { period: input.period, generated, alreadyGenerated };
    });
};

export const listFeeVouchers = async (req, input) => {
    const schoolId = assertTenant(req);
    const filter = {
        schoolId,
        ...(input.studentId && { studentId: input.studentId }),
        ...(input.feeStructureId && { feeStructureId: input.feeStructureId }),
        ...(input.period && { period: input.period }),
        ...(input.status && { status: input.status }),
        ...(input.outstandingOnly && { balanceMinor: { $gt: 0 } })
    };
    return listPage(FeeVoucher, filter, input, { dueDate: 1, _id: 1 });
};

export const getFeeVoucher = async (req, voucherId) => {
    const schoolId = assertTenant(req);
    const voucher = await FeeVoucher.findOne({ _id: voucherId, schoolId }).lean();
    if (!voucher) throw new HttpError(404, "Fee voucher was not found in this school");
    return voucher;
};

const publicPayment = (payment) => ({
    id: payment._id.toString(),
    voucherId: payment.voucherId.toString(),
    studentId: payment.studentId.toString(),
    receiptNumber: payment.receiptNumber,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    method: payment.method,
    reference: payment.reference,
    note: payment.note,
    receivedBy: payment.receivedBy.toString(),
    receivedAt: payment.receivedAt
});

export const collectFeePayment = async (req, voucherId, input) => {
    const schoolId = assertTenant(req);
    const collect = () => withTransaction(async (session) => {
        const existingPayment = await FeePayment.findOne({
            schoolId,
            idempotencyKey: input.idempotencyKey
        }).session(session);
        if (existingPayment) {
            if (String(existingPayment.voucherId) !== String(voucherId)
                || existingPayment.amountMinor !== input.amountMinor
                || existingPayment.method !== input.method
                || existingPayment.reference !== input.reference
                || existingPayment.note !== input.note) {
                throw new HttpError(409, "Idempotency key was already used for a different payment");
            }
            return { payment: publicPayment(existingPayment), replayed: true };
        }

        const voucher = await FeeVoucher.findOne({ _id: voucherId, schoolId }).session(session);
        if (!voucher) throw new HttpError(404, "Fee voucher was not found in this school");
        if (input.amountMinor > voucher.balanceMinor || voucher.balanceMinor <= 0) {
            throw new HttpError(409, "Payment exceeds the outstanding voucher balance");
        }
        const remaining = voucher.balanceMinor - input.amountMinor;
        const updated = await FeeVoucher.findOneAndUpdate(
            { _id: voucher._id, schoolId, balanceMinor: { $gte: input.amountMinor } },
            {
                $inc: { paidAmountMinor: input.amountMinor, balanceMinor: -input.amountMinor },
                $set: { status: remaining === 0 ? "paid" : "partial" }
            },
            { new: true, runValidators: true, session }
        );
        if (!updated) throw new HttpError(409, "Voucher balance changed; reload and retry the payment");

        const receiptNumber = `RCPT-${new Date().getUTCFullYear()}-${randomUUID().replaceAll("-", "").slice(0, 20).toUpperCase()}`;
        const payment = new FeePayment({
            schoolId,
            voucherId: voucher._id,
            studentId: voucher.studentId,
            receiptNumber,
            idempotencyKey: input.idempotencyKey,
            amountMinor: input.amountMinor,
            currency: voucher.currency,
            method: input.method,
            reference: input.reference,
            note: input.note,
            receivedBy: req.user._id
        });
        await payment.save({ session });
        await writeAudit(req, session, "fee_payment.collected", "fee_payment", payment._id, {
            voucherId: voucher._id,
            receiptNumber,
            amountMinor: input.amountMinor,
            method: input.method
        });
        return { payment: publicPayment(payment), replayed: false };
    });

    try {
        return await collect();
    } catch (error) {
        if (error?.code !== 11000) throw error;
        const payment = await FeePayment.findOne({ schoolId, idempotencyKey: input.idempotencyKey }).lean();
        if (!payment) throw error;
        if (String(payment.voucherId) !== String(voucherId)
            || payment.amountMinor !== input.amountMinor
            || payment.method !== input.method
            || payment.reference !== input.reference
            || payment.note !== input.note) {
            throw new HttpError(409, "Idempotency key was already used for a different payment");
        }
        return { payment: publicPayment(payment), replayed: true };
    }
};

export const listVoucherPayments = async (req, voucherId, input) => {
    const schoolId = assertTenant(req);
    const voucher = await FeeVoucher.exists({ _id: voucherId, schoolId });
    if (!voucher) throw new HttpError(404, "Fee voucher was not found in this school");
    const page = input.page ?? 1;
    const limit = input.limit ?? 25;
    const [items, total] = await Promise.all([
        FeePayment.find({ schoolId, voucherId })
            .sort({ receivedAt: -1, _id: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        FeePayment.countDocuments({ schoolId, voucherId })
    ]);
    return { items: items.map(publicPayment), pagination: pageResult(page, limit, total) };
};

export const getPaymentReceipt = async (req, receiptNumber) => {
    const schoolId = assertTenant(req);
    const payment = await FeePayment.findOne({ schoolId, receiptNumber: receiptNumber.toUpperCase() }).lean();
    if (!payment) throw new HttpError(404, "Payment receipt was not found in this school");
    return publicPayment(payment);
};

export const getOverdueFeeReport = async (req, input) => {
    const schoolId = assertTenant(req);
    const asOf = input.asOf
        ? new Date(`${input.asOf}T00:00:00.000Z`)
        : new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
    const filter = {
        schoolId,
        dueDate: { $lt: asOf },
        balanceMinor: { $gt: 0 },
        ...(input.classId && { classId: input.classId })
    };
    const page = input.page ?? 1;
    const limit = input.limit ?? 25;
    const [items, total, totals] = await Promise.all([
        FeeVoucher.find(filter)
            .populate({ path: "studentId", match: { schoolId }, select: "admissionNumber firstName lastName" })
            .sort({ dueDate: 1, _id: 1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        FeeVoucher.countDocuments(filter),
        FeeVoucher.aggregate([
            { $match: filter },
            { $group: { _id: "$currency", count: { $sum: 1 }, balanceMinor: { $sum: "$balanceMinor" } } }
        ])
    ]);
    return {
        asOf,
        totals: totals.map((item) => ({
            currency: item._id,
            vouchers: item.count,
            balanceMinor: item.balanceMinor
        })),
        items: items.filter((item) => item.studentId),
        pagination: pageResult(page, limit, total)
    };
};

export const getFeeCollectionReport = async (req, input) => {
    const schoolId = assertTenant(req);
    const from = new Date(`${input.from}T00:00:00.000Z`);
    const to = new Date(`${input.to}T00:00:00.000Z`);
    to.setUTCDate(to.getUTCDate() + 1);
    const pipeline = [
        { $match: { schoolId, receivedAt: { $gte: from, $lt: to } } },
        {
            $lookup: {
                from: FeeVoucher.collection.name,
                localField: "voucherId",
                foreignField: "_id",
                as: "voucher"
            }
        },
        { $unwind: "$voucher" },
        { $match: { "voucher.schoolId": schoolId, ...(input.classId && { "voucher.classId": input.classId }) } },
        {
            $group: {
                _id: { currency: "$currency", method: "$method" },
                payments: { $sum: 1 },
                amountMinor: { $sum: "$amountMinor" }
            }
        },
        { $sort: { "_id.currency": 1, "_id.method": 1 } }
    ];
    const rows = await FeePayment.aggregate(pipeline);
    return {
        from: input.from,
        to: input.to,
        totals: rows.map((row) => ({
            currency: row._id.currency,
            method: row._id.method,
            payments: row.payments,
            amountMinor: row.amountMinor
        }))
    };
};
