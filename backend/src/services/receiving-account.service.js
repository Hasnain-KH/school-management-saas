import AuditLog from "../models/audit-log.model.js";
import PlatformReceivingAccount from "../models/platform-receiving-account.model.js";
import { HttpError } from "../utils/http-error.js";
import { withTransaction } from "../utils/transaction.js";

const pageInfo = (page, limit, total) => ({ page, limit, total, pages: Math.ceil(total / limit) });
const RESOURCE_TYPE = "platform_receiving_account";

const writePlatformAudit = async (req, session, action, resourceId, metadata = {}) => {
    await new AuditLog({
        schoolId: null,
        actorUserId: req.user._id,
        action,
        resourceType: RESOURCE_TYPE,
        resourceId,
        metadata
    }).save({ session });
};

const publicAccount = (account) => {
    const source = account.toObject ? account.toObject() : account;
    return {
        id: String(source._id),
        accountType: source.accountType,
        providerName: source.providerName,
        accountTitle: source.accountTitle,
        accountNumber: source.accountNumber,
        iban: source.iban || null,
        mobileWalletNumber: source.mobileWalletNumber || null,
        instructions: source.instructions || null,
        isActive: source.isActive,
        createdAt: source.createdAt,
        updatedAt: source.updatedAt
    };
};

// Explicit projection used by the school-owner read endpoint. Internal fields
// (audit actors and timestamps beyond display needs) never leave this module.
const SCHOOL_VISIBLE_FIELDS = "accountType providerName accountTitle accountNumber iban mobileWalletNumber instructions updatedAt";
const publicSchoolAccount = (account) => {
    const source = account.toObject ? account.toObject() : account;
    return {
        id: String(source._id),
        accountType: source.accountType,
        providerName: source.providerName,
        accountTitle: source.accountTitle,
        accountNumber: source.accountNumber,
        iban: source.iban || null,
        mobileWalletNumber: source.mobileWalletNumber || null,
        instructions: source.instructions || null
    };
};

export const createReceivingAccount = async (req, input) => withTransaction(async (session) => {
    const account = new PlatformReceivingAccount({
        ...input,
        iban: input.iban ?? null,
        mobileWalletNumber: input.mobileWalletNumber ?? null,
        instructions: input.instructions ?? null,
        createdBy: req.user._id,
        updatedBy: req.user._id
    });
    try {
        await account.save({ session });
    } catch (error) {
        if (error?.code === 11000) throw new HttpError(409, "A receiving account with these details already exists");
        throw error;
    }
    await writePlatformAudit(req, session, "platform.receiving_account.created", account._id, {
        accountType: account.accountType,
        isActive: account.isActive
    });
    return publicAccount(account);
});

export const listReceivingAccounts = async (input) => {
    const page = input.page ?? 1;
    const limit = input.limit ?? 25;
    const filter = {};
    if (input.isActive !== undefined) filter.isActive = input.isActive;
    if (input.search) {
        const escaped = input.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        filter.$or = [
            { providerName: new RegExp(escaped, "i") },
            { accountTitle: new RegExp(escaped, "i") },
            { accountNumber: new RegExp(escaped, "i") }
        ];
    }
    const [items, total] = await Promise.all([
        PlatformReceivingAccount.find(filter)
            .sort({ isActive: -1, accountType: 1, providerName: 1, createdAt: -1 })
            .skip((page - 1) * limit).limit(limit).lean(),
        PlatformReceivingAccount.countDocuments(filter)
    ]);
    return { items: items.map(publicAccount), pagination: pageInfo(page, limit, total) };
};

const findAccount = async (accountId, session = null) => {
    const query = PlatformReceivingAccount.findById(accountId);
    if (session) query.session(session);
    const account = await query;
    if (!account) throw new HttpError(404, "Receiving account was not found");
    return account;
};

export const updateReceivingAccount = async (req, accountId, input) => withTransaction(async (session) => {
    const account = await findAccount(accountId, session);
    Object.assign(account, input, { updatedBy: req.user._id });
    try {
        await account.save({ session });
    } catch (error) {
        if (error?.code === 11000) throw new HttpError(409, "A receiving account with these details already exists");
        throw error;
    }
    await writePlatformAudit(req, session, "platform.receiving_account.updated", account._id, {
        fields: Object.keys(input),
        isActive: account.isActive
    });
    return publicAccount(account);
});

export const setReceivingAccountStatus = async (req, accountId, isActive) => withTransaction(async (session) => {
    const account = await findAccount(accountId, session);
    account.isActive = isActive;
    account.updatedBy = req.user._id;
    await account.save({ session });
    await writePlatformAudit(req, session,
        `platform.receiving_account.${isActive ? "activated" : "deactivated"}`, account._id);
    return publicAccount(account);
});

export const deleteReceivingAccount = async (req, accountId) => withTransaction(async (session) => {
    const account = await findAccount(accountId, session);
    await account.deleteOne({ session });
    await writePlatformAudit(req, session, "platform.receiving_account.deleted", account._id, {
        accountType: account.accountType
    });
    return { id: String(account._id) };
});

// School-owner visibility: ACTIVE accounts only, explicit projection, no
// mutation capability, and no platform audit metadata.
export const listActiveReceivingAccountsForSchool = async () => {
    const accounts = await PlatformReceivingAccount.find({ isActive: true })
        .select(SCHOOL_VISIBLE_FIELDS)
        .sort({ accountType: 1, providerName: 1, createdAt: -1 })
        .limit(100)
        .lean();
    return accounts.map(publicSchoolAccount);
};
