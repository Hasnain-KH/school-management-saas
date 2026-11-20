import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

import SchoolDocument from "../src/models/document.model.js";
import Student from "../src/models/student.model.js";
import User from "../src/models/user.model.js";
import AuditLog from "../src/models/audit-log.model.js";
import {
    createDocument,
    deleteDocument,
    getDocumentDownloadUrl
} from "../src/services/document.service.js";
import {
    configureDocumentStorageProvider,
    getDocumentStorageProviderName,
    registerDocumentStorageProvider
} from "../src/services/document-storage.provider.js";

// Dummy fixtures only. Every model call and storage adapter is mocked, so this
// suite opens no MongoDB connection and makes no Cloudinary/S3 request.
const SCHOOL_A = "64a000000000000000000001";
const USER_A = "64a000000000000000000003";
const DOC_ID = "64a000000000000000000021";

const makeStorage = ({ uploadError } = {}) => {
    const calls = { upload: [], delete: [], download: [] };
    const objects = new Map();
    return {
        objects,
        calls,
        upload: async ({ key, body, contentType }) => {
            calls.upload.push({ key, body, contentType });
            if (uploadError) throw uploadError;
            objects.set(key, { body, contentType });
            return { key };
        },
        delete: async ({ key }) => {
            calls.delete.push({ key });
            objects.delete(key);
            return { deleted: true };
        },
        createDownloadUrl: async ({ key, contentType }) => {
            calls.download.push({ key, contentType });
            return `test://download/${encodeURIComponent(key)}`;
        }
    };
};

const makeReq = () => ({
    user: { _id: USER_A, schoolId: SCHOOL_A, role: "school_admin" },
    school: { _id: SCHOOL_A }
});

const makeInput = (overrides = {}) => ({
    title: "Report",
    category: "other",
    fileName: "report.pdf",
    contentType: "application/pdf",
    dataBase64: Buffer.from("dummy-pdf-bytes").toString("base64"),
    ...overrides
});

const makeRecord = (overrides = {}) => ({
    _id: DOC_ID,
    studentId: null,
    subjectUserId: null,
    isActive: true,
    save: async () => {},
    ...overrides
});

const setupTransaction = (t) => {
    t.mock.method(mongoose, "startSession", async () => ({
        withTransaction: async (callback) => callback(),
        endSession: async () => {}
    }));
};

const setupLookups = (t) => {
    t.mock.method(Student, "exists", async () => true);
    t.mock.method(User, "exists", async () => true);
};

const setupAudits = (t, audits) => {
    t.mock.method(AuditLog.prototype, "save", async function saveAudit() {
        audits.push(this);
        return this;
    });
};

const setupCreateMocks = (t, saved, audits) => {
    setupTransaction(t);
    setupLookups(t);
    t.mock.method(SchoolDocument.prototype, "save", async function saveDocument() {
        saved.push(this);
        return this;
    });
    setupAudits(t, audits);
};

test("document upload uses the selected Cloudinary provider and stores storageProvider", async (t) => {
    const saved = [];
    const audits = [];
    setupCreateMocks(t, saved, audits);

    const cloud = makeStorage();
    const s3 = makeStorage();
    registerDocumentStorageProvider("s3", s3);
    configureDocumentStorageProvider(cloud, "cloudinary");

    const result = await createDocument(makeReq(), makeInput());

    assert.equal(getDocumentStorageProviderName(), "cloudinary");
    assert.equal(cloud.calls.upload.length, 1);
    assert.equal(s3.calls.upload.length, 0);
    const uploaded = cloud.calls.upload[0];
    assert.match(uploaded.key, new RegExp(`^${SCHOOL_A}/other/`));
    assert.equal(Buffer.isBuffer(uploaded.body), true);
    assert.equal(uploaded.contentType, "application/pdf");

    assert.equal(saved.length, 1);
    assert.equal(saved[0].storageProvider, "cloudinary");
    assert.equal(saved[0].storageKey, uploaded.key);
    assert.equal(saved[0].schoolId.toString(), SCHOOL_A);
    assert.equal(saved[0].checksum.length, 64);

    assert.equal(result.fileName, "report.pdf");
    assert.equal(result.storageKey, undefined);
    assert.equal(result.storageProvider, undefined);

    assert.equal(audits.length, 1);
    assert.equal(audits[0].action, "document.uploaded");
    assert.equal(audits[0].schoolId.toString(), SCHOOL_A);
});

test("download uses the provider stored on the record", async (t) => {
    const cloud = makeStorage();
    const s3 = makeStorage();
    registerDocumentStorageProvider("s3", s3);
    registerDocumentStorageProvider("cloudinary", cloud);
    configureDocumentStorageProvider(s3, "s3");

    const key = `documents/${SCHOOL_A}/cloudinary-file.pdf`;
    t.mock.method(SchoolDocument, "findOne", async () => makeRecord({
        storageKey: key,
        storageProvider: "cloudinary",
        contentType: "application/pdf",
        fileName: "cloudinary-file.pdf"
    }));

    const result = await getDocumentDownloadUrl(makeReq(), DOC_ID);

    assert.equal(cloud.calls.download.length, 1);
    assert.equal(s3.calls.download.length, 0);
    assert.equal(cloud.calls.download[0].key, key);
    assert.equal(cloud.calls.download[0].contentType, "application/pdf");
    assert.equal(result.id, DOC_ID);
    assert.equal(result.fileName, "cloudinary-file.pdf");
});

test("delete uses the provider stored on the record", async (t) => {
    const audits = [];
    setupTransaction(t);
    setupAudits(t, audits);

    const cloud = makeStorage();
    const s3 = makeStorage();
    registerDocumentStorageProvider("s3", s3);
    registerDocumentStorageProvider("cloudinary", cloud);
    configureDocumentStorageProvider(s3, "s3");

    const key = `documents/${SCHOOL_A}/cloudinary-file.pdf`;
    const record = makeRecord({ storageKey: key, storageProvider: "cloudinary" });
    t.mock.method(SchoolDocument, "findOne", async () => record);

    const result = await deleteDocument(makeReq(), DOC_ID);

    assert.equal(result.deleted, true);
    assert.equal(cloud.calls.delete.length, 1);
    assert.equal(s3.calls.delete.length, 0);
    assert.equal(cloud.calls.delete[0].key, key);
    assert.equal(record.isActive, false);
    assert.equal(audits.length, 1);
    assert.equal(audits[0].action, "document.deleted");
});

test("legacy records without storageProvider default to S3", async (t) => {
    const audits = [];
    const s3 = makeStorage();
    const cloud = makeStorage();
    registerDocumentStorageProvider("s3", s3);
    registerDocumentStorageProvider("cloudinary", cloud);
    configureDocumentStorageProvider(cloud, "cloudinary");

    const key = `documents/${SCHOOL_A}/legacy.pdf`;
    // Intentionally no storageProvider field: legacy records predate the tag.
    t.mock.method(SchoolDocument, "findOne", async () => makeRecord({
        storageKey: key,
        contentType: "application/pdf"
    }));

    const download = await getDocumentDownloadUrl(makeReq(), DOC_ID);
    assert.equal(s3.calls.download.length, 1);
    assert.equal(cloud.calls.download.length, 0);
    assert.equal(s3.calls.download[0].key, key);
    assert.equal(download.fileName, undefined);

    setupTransaction(t);
    setupAudits(t, audits);
    const deleted = await deleteDocument(makeReq(), DOC_ID);

    assert.equal(deleted.deleted, true);
    assert.equal(s3.calls.delete.length, 1);
    assert.equal(s3.calls.delete[0].key, key);
    assert.equal(cloud.calls.delete.length, 0);
});

test("storage upload failure propagates and writes no metadata", async (t) => {
    const saved = [];
    const audits = [];
    setupCreateMocks(t, saved, audits);

    const uploadError = new Error("dummy upload failure");
    const cloud = makeStorage({ uploadError });
    configureDocumentStorageProvider(cloud, "cloudinary");

    await assert.rejects(
        () => createDocument(makeReq(), makeInput()),
        (error) => error === uploadError
    );

    assert.equal(cloud.calls.upload.length, 1);
    assert.equal(saved.length, 0);
    assert.equal(audits.length, 0);
    // The upload happens before the metadata try/catch, so there is no rollback delete.
    assert.equal(cloud.calls.delete.length, 0);
});

test("database failure after upload removes only the uploaded object", async (t) => {
    const audits = [];
    setupTransaction(t);
    setupLookups(t);
    setupAudits(t, audits);
    const dbError = new Error("dummy save failure");
    t.mock.method(SchoolDocument.prototype, "save", async () => { throw dbError; });

    const cloud = makeStorage();
    configureDocumentStorageProvider(cloud, "cloudinary");

    await assert.rejects(
        () => createDocument(makeReq(), makeInput()),
        (error) => error === dbError
    );

    assert.equal(cloud.calls.upload.length, 1);
    assert.equal(cloud.calls.delete.length, 1);
    assert.equal(cloud.calls.delete[0].key, cloud.calls.upload[0].key);
    assert.equal(cloud.objects.size, 0);
    assert.equal(audits.length, 0);
});
