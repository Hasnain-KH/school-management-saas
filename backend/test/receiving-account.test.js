import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import AuditLog from "../src/models/audit-log.model.js";
import PlatformReceivingAccount from "../src/models/platform-receiving-account.model.js";
import platformRouter from "../src/routes/platform.routes.js";
import schoolRouter from "../src/routes/school.routes.js";
import { hasPermission, requireRoles } from "../src/middleware/authorization.middleware.js";
import {
    receivingAccountCreateSchema,
    receivingAccountDeleteQuerySchema,
    receivingAccountUpdateSchema
} from "../src/validators/receiving-account.validator.js";
import {
    createReceivingAccount,
    listActiveReceivingAccountsForSchool
} from "../src/services/receiving-account.service.js";

const objectId = () => new mongoose.Types.ObjectId();

const bankInput = {
    accountType: "bank_account",
    providerName: "Example Bank",
    accountTitle: "SchoolFlow Platform",
    accountNumber: "1234 5678 9012",
    isActive: true
};

const withMockedTransaction = (t) => {
    const transaction = {
        async withTransaction(callback) { return callback({}); },
        async endSession() {}
    };
    t.mock.method(mongoose, "startSession", async () => transaction);
};

const routePaths = (router) => router.stack
    .filter((layer) => layer.route)
    .map((layer) => layer.route.path);

test("receiving-account validation accepts a bank account with no wallet number", () => {
    const parsed = receivingAccountCreateSchema.parse(bankInput);
    assert.equal(parsed.accountType, "bank_account");
    assert.equal(parsed.isActive, true);
});

test("receiving-account validation requires a wallet number for wallet providers", () => {
    assert.throws(() => receivingAccountCreateSchema.parse({
        ...bankInput,
        accountType: "jazzcash"
    }), /mobile wallet number is required/i);
    assert.doesNotThrow(() => receivingAccountCreateSchema.parse({
        ...bankInput,
        accountType: "easypaisa",
        mobileWalletNumber: "0300 1234567"
    }));
});

test("receiving-account validation rejects credentials and unknown fields", () => {
    assert.throws(() => receivingAccountCreateSchema.parse({
        ...bankInput,
        instructions: "Bank password is 1234"
    }), /login credentials/i);
    assert.throws(() => receivingAccountCreateSchema.parse({
        ...bankInput,
        password: "secret"
    }), /unrecognized key/i);
    assert.throws(() => receivingAccountUpdateSchema.parse({}), /at least one field/i);
});

test("receiving-account deletion requires an explicit confirmation", () => {
    assert.throws(() => receivingAccountDeleteQuerySchema.parse({}), /invalid input|invalid literal/i);
    assert.doesNotThrow(() => receivingAccountDeleteQuerySchema.parse({ confirm: "true" }));
});

test("platform router exposes admin-only receiving-account routes", () => {
    const paths = routePaths(platformRouter);
    for (const path of [
        "/receiving-accounts",
        "/receiving-accounts/:accountId/status",
        "/receiving-accounts/:accountId"
    ]) {
        assert.ok(paths.includes(path), `missing platform route ${path}`);
    }
});

test("school router exposes one read-only receiving-account route", () => {
    const paths = routePaths(schoolRouter).filter((path) => path.includes("receiving"));
    assert.deepEqual(paths, ["/receiving-accounts"]);
});

test("only platform super admins hold platform:manage and school owners are a strict role", async () => {
    assert.equal(hasPermission("platform_super_admin", "platform:manage"), true);
    for (const role of ["school_admin", "principal", "teacher", "parent"]) {
        assert.equal(hasPermission(role, "platform:manage"), false, `${role} must not manage platform accounts`);
    }
    const next = requireRoles("school_admin");
    const call = (role) => new Promise((resolve) => next({ user: { role } }, {}, (error) => resolve(error)));
    assert.equal(await call("school_admin"), undefined);
    assert.match((await call("principal")).message, /permission/i);
    assert.match((await call("teacher")).message, /permission/i);
});

test("creating a receiving account writes a platform-scoped audit event", async (t) => {
    withMockedTransaction(t);
    t.mock.method(PlatformReceivingAccount.prototype, "save", async function save() { return this; });
    let auditSchoolId = "unset";
    t.mock.method(AuditLog.prototype, "save", async function save() {
        auditSchoolId = this.schoolId;
        return this;
    });

    const result = await createReceivingAccount(
        { user: { _id: objectId() } },
        bankInput
    );

    assert.equal(result.accountType, "bank_account");
    assert.equal(result.accountNumber, bankInput.accountNumber);
    assert.equal(String(auditSchoolId), "null");
});

test("school-owner listing only returns active accounts and a safe projection", async (t) => {
    let capturedFilter;
    t.mock.method(PlatformReceivingAccount, "find", (filter) => {
        capturedFilter = filter;
        return {
            select: () => ({
                sort: () => ({
                    limit: () => ({ lean: async () => [{
                        _id: objectId(),
                        accountType: "bank_account",
                        providerName: "Example Bank",
                        accountTitle: "SchoolFlow Platform",
                        accountNumber: "1234 5678 9012",
                        iban: null,
                        mobileWalletNumber: null,
                        instructions: "Use the reference number",
                        createdBy: objectId(),
                        updatedBy: objectId()
                    }]
                })
            })
        })
        };
    });

    const accounts = await listActiveReceivingAccountsForSchool();

    assert.deepEqual(capturedFilter, { isActive: true });
    assert.equal(accounts.length, 1);
    assert.equal(accounts[0].accountNumber, "1234 5678 9012");
    assert.equal("createdBy" in accounts[0], false);
    assert.equal("updatedBy" in accounts[0], false);
});
