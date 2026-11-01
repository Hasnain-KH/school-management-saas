import Announcement from "../models/announcement.model.js";
import AuditLog from "../models/audit-log.model.js";
import CalendarEvent from "../models/calendar-event.model.js";
import InventoryItem from "../models/inventory-item.model.js";
import InventoryTransaction from "../models/inventory-transaction.model.js";
import LibraryBook from "../models/library-book.model.js";
import LibraryLoan from "../models/library-loan.model.js";
import School from "../models/school.model.js";
import Student from "../models/student.model.js";
import { HttpError } from "../utils/http-error.js";
import { withTransaction } from "../utils/transaction.js";

const assertTenant = (req) => {
    if (!req.user?.schoolId || !req.school
        || String(req.user.schoolId) !== String(req.school._id)) {
        throw new HttpError(403, "A matching school tenant context is required");
    }
    return req.user.schoolId;
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const pageInfo = (page, limit, total) => ({ page, limit, total, pages: Math.ceil(total / limit) });
const utcDate = (date) => new Date(`${date}T00:00:00.000Z`);

const writeAudit = async (req, session, action, resourceType, resourceId, metadata = {}) => {
    const log = new AuditLog({
        schoolId: assertTenant(req),
        actorUserId: req.user._id,
        action,
        resourceType,
        resourceId,
        metadata
    });
    await log.save({ session });
};

const paginatedList = async (Model, filter, input, sort, searchFields = []) => {
    const page = input.page ?? 1;
    const limit = input.limit ?? 25;
    if (input.search && searchFields.length) {
        const pattern = new RegExp(escapeRegex(input.search), "i");
        filter.$and = [
            ...(filter.$and ?? []),
            { $or: searchFields.map((field) => ({ [field]: pattern })) }
        ];
    }
    const [items, total] = await Promise.all([
        Model.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
        Model.countDocuments(filter)
    ]);
    return { items, pagination: pageInfo(page, limit, total) };
};

export const createCalendarEvent = async (req, input) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        if (input.branchId) {
            const school = await School.findById(schoolId).session(session);
            if (!school?.branches.some((branch) => String(branch._id) === String(input.branchId))) {
                throw new HttpError(404, "Branch was not found in this school");
            }
        }
        const event = new CalendarEvent({
            ...input,
            schoolId,
            startsAt: utcDate(input.startsAt),
            endsAt: utcDate(input.endsAt),
            createdBy: req.user._id
        });
        await event.save({ session });
        await writeAudit(req, session, "calendar.event.created", "calendar_event", event._id, {
            type: event.type,
            startsAt: event.startsAt,
            endsAt: event.endsAt
        });
        return event.toObject();
    });
};

export const listCalendarEvents = async (req, input) => {
    const schoolId = assertTenant(req);
    const filter = {
        schoolId,
        isActive: true,
        audience: req.user.role,
        startsAt: { $lte: new Date(`${input.to}T23:59:59.999Z`) },
        endsAt: { $gte: utcDate(input.from) },
        ...(input.type && { type: input.type }),
        ...(input.branchId && { branchId: input.branchId })
    };
    return paginatedList(CalendarEvent, filter, input, { startsAt: 1, _id: 1 }, ["title"]);
};

export const createInventoryItem = async (req, input) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const item = new InventoryItem({
            ...input,
            schoolId,
            sku: input.sku.toUpperCase(),
            quantityOnHand: 0,
            createdBy: req.user._id
        });
        try {
            await item.save({ session });
        } catch (error) {
            if (error?.code === 11000) throw new HttpError(409, "Inventory SKU already exists");
            throw error;
        }
        await writeAudit(req, session, "inventory.item.created", "inventory_item", item._id);
        return item.toObject();
    });
};

export const listInventoryItems = async (req, input) => {
    const schoolId = assertTenant(req);
    const filter = {
        schoolId,
        isActive: true,
        ...(input.category && { category: input.category })
    };
    if (input.lowStockOnly) filter.$expr = { $lte: ["$quantityOnHand", "$reorderLevel"] };
    return paginatedList(InventoryItem, filter, input, { name: 1, _id: 1 }, ["name", "sku", "category"]);
};

export const recordInventoryMovement = async (req, itemId, input) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const increment = input.type === "received" ? input.quantity : -input.quantity;
        const filter = {
            _id: itemId,
            schoolId,
            isActive: true,
            ...(input.type === "issued" && { quantityOnHand: { $gte: input.quantity } })
        };
        const item = await InventoryItem.findOneAndUpdate(
            filter,
            { $inc: { quantityOnHand: increment } },
            { new: true, runValidators: true, session }
        );
        if (!item) {
            const exists = await InventoryItem.exists({ _id: itemId, schoolId }).session(session);
            if (!exists) throw new HttpError(404, "Inventory item was not found in this school");
            throw new HttpError(409, "Inventory issue exceeds available quantity or item is inactive");
        }
        const movement = new InventoryTransaction({
            schoolId,
            itemId: item._id,
            type: input.type,
            quantity: input.quantity,
            reference: input.reference,
            note: input.note,
            actorUserId: req.user._id
        });
        await movement.save({ session });
        await writeAudit(req, session, `inventory.${input.type}`, "inventory_item", item._id, {
            quantity: input.quantity,
            transactionId: movement._id
        });
        return { item: item.toObject(), transaction: movement.toObject() };
    });
};

export const listInventoryTransactions = async (req, itemId, input) => {
    const schoolId = assertTenant(req);
    if (!await InventoryItem.exists({ _id: itemId, schoolId })) {
        throw new HttpError(404, "Inventory item was not found in this school");
    }
    return paginatedList(
        InventoryTransaction,
        { schoolId, itemId },
        input,
        { occurredAt: -1, _id: -1 }
    );
};

export const listLowStockItems = async (req, input) => {
    const schoolId = assertTenant(req);
    return paginatedList(InventoryItem, {
        schoolId,
        isActive: true,
        $expr: { $lte: ["$quantityOnHand", "$reorderLevel"] }
    }, input, { quantityOnHand: 1, name: 1, _id: 1 });
};

export const createLibraryBook = async (req, input) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const book = new LibraryBook({
            ...input,
            isbn: input.isbn?.toUpperCase(),
            schoolId,
            copiesAvailable: input.copiesTotal,
            createdBy: req.user._id
        });
        try {
            await book.save({ session });
        } catch (error) {
            if (error?.code === 11000) throw new HttpError(409, "This ISBN already exists in the school library");
            throw error;
        }
        await writeAudit(req, session, "library.book.created", "library_book", book._id, {
            copiesTotal: book.copiesTotal
        });
        return book.toObject();
    });
};

export const listLibraryBooks = async (req, input) => {
    const schoolId = assertTenant(req);
    const filter = {
        schoolId,
        isActive: true,
        ...(input.availableOnly && { copiesAvailable: { $gt: 0 } })
    };
    return paginatedList(LibraryBook, filter, input, { title: 1, _id: 1 }, ["title", "author", "isbn"]);
};

export const issueLibraryBook = async (req, input) => {
    const schoolId = assertTenant(req);
    if (utcDate(input.dueAt) < utcDate(new Date().toISOString().slice(0, 10))) {
        throw new HttpError(400, "Loan due date must not be in the past");
    }
    return withTransaction(async (session) => {
        const [student, book] = await Promise.all([
            Student.findOne({ _id: input.studentId, schoolId, status: "enrolled" }).session(session),
            LibraryBook.findOneAndUpdate(
                { _id: input.bookId, schoolId, isActive: true, copiesAvailable: { $gt: 0 } },
                { $inc: { copiesAvailable: -1 } },
                { new: true, runValidators: true, session }
            )
        ]);
        if (!student) throw new HttpError(404, "Enrolled student was not found in this school");
        if (!book) {
            const exists = await LibraryBook.exists({ _id: input.bookId, schoolId }).session(session);
            if (!exists) throw new HttpError(404, "Book was not found in this school");
            throw new HttpError(409, "No copies are currently available");
        }
        const loan = new LibraryLoan({
            schoolId,
            bookId: book._id,
            studentId: student._id,
            issuedBy: req.user._id,
            dueAt: utcDate(input.dueAt),
            note: input.note
        });
        try {
            await loan.save({ session });
        } catch (error) {
            if (error?.code === 11000) {
                throw new HttpError(409, "Student already has an active loan for this book");
            }
            throw error;
        }
        await writeAudit(req, session, "library.book.issued", "library_loan", loan._id, {
            bookId: book._id,
            studentId: student._id,
            dueAt: loan.dueAt
        });
        return loan.toObject();
    });
};

export const returnLibraryBook = async (req, loanId) => {
    const schoolId = assertTenant(req);
    return withTransaction(async (session) => {
        const loan = await LibraryLoan.findOneAndUpdate(
            { _id: loanId, schoolId, status: "checked_out" },
            { $set: { status: "returned", returnedAt: new Date(), returnedTo: req.user._id } },
            { new: true, runValidators: true, session }
        );
        if (!loan) {
            const exists = await LibraryLoan.exists({ _id: loanId, schoolId }).session(session);
            if (!exists) throw new HttpError(404, "Active library loan was not found in this school");
            throw new HttpError(409, "Library loan has already been returned");
        }
        const bookUpdate = await LibraryBook.updateOne(
            {
                _id: loan.bookId,
                schoolId,
                $expr: { $lt: ["$copiesAvailable", "$copiesTotal"] }
            },
            { $inc: { copiesAvailable: 1 } },
            { session }
        );
        if (bookUpdate.modifiedCount !== 1) {
            throw new HttpError(409, "Book copy count is inconsistent; return was not completed");
        }
        await writeAudit(req, session, "library.book.returned", "library_loan", loan._id, {
            bookId: loan.bookId,
            studentId: loan.studentId
        });
        return loan.toObject();
    });
};

export const listLibraryLoans = async (req, input) => {
    const schoolId = assertTenant(req);
    const filter = {
        schoolId,
        ...(input.studentId && { studentId: input.studentId }),
        ...(input.bookId && { bookId: input.bookId }),
        ...(input.status && { status: input.status }),
        ...(input.overdueOnly && { status: "checked_out", dueAt: { $lt: new Date() } })
    };
    return paginatedList(LibraryLoan, filter, input, { dueAt: 1, _id: 1 });
};

export const createAnnouncement = async (req, input) => {
    const schoolId = assertTenant(req);
    if (input.expiresAt && utcDate(input.expiresAt) < utcDate(new Date().toISOString().slice(0, 10))) {
        throw new HttpError(400, "Announcement expiry must not be in the past");
    }
    return withTransaction(async (session) => {
        const announcement = new Announcement({
            ...input,
            schoolId,
            expiresAt: input.expiresAt ? utcDate(input.expiresAt) : undefined,
            createdBy: req.user._id
        });
        await announcement.save({ session });
        await writeAudit(req, session, "announcement.created", "announcement", announcement._id, {
            audience: announcement.audience
        });
        return announcement.toObject();
    });
};

export const listAnnouncements = async (req, input) => {
    const schoolId = assertTenant(req);
    const now = new Date();
    return paginatedList(Announcement, {
        schoolId,
        isActive: true,
        audience: req.user.role,
        publishedAt: { $lte: now },
        $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gte: now } }]
    }, input, { publishedAt: -1, _id: -1 }, ["title", "body"]);
};
