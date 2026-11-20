import assert from "node:assert/strict";
import test from "node:test";
import { describeErrorForDevelopment } from "../src/utils/error-diagnostics.js";
import { errorHandler } from "../src/middleware/error.middleware.js";

const makeResponse = () => {
    const state = { status: null, body: null };
    return {
        state,
        status(code) { state.status = code; return this; },
        json(body) { state.body = body; return this; }
    };
};

test("development diagnostics expose MongoDB code, codeName and index field names only", () => {
    const error = Object.assign(new Error("duplicate key"), {
        name: "MongoServerError",
        code: 11000,
        codeName: "DuplicateKey",
        index: "schoolId_1_academicSessionId_1_sectionId_1_dayOfWeek_1_periodNumber_1",
        namespace: "schoolflow.timetableentries",
        keyPattern: { schoolId: 1, sectionId: 1, periodNumber: 1 },
        keyValue: { schoolId: "secret", sectionId: "secret", periodNumber: 3 },
        stack: "MongoServerError: duplicate key\n    at save (/app/model.js:10:5)\n    at handler (/app/route.js:20:3)"
    });
    const diagnostic = describeErrorForDevelopment(error, {
        method: "POST",
        baseUrl: "/api/v1/academics",
        route: { path: "/timetable" },
        originalUrl: "/api/v1/academics/timetable?token=TOPSECRET",
        headers: { cookie: "session=TOPSECRET" }
    });

    assert.equal(diagnostic.name, "MongoServerError");
    assert.equal(diagnostic.code, 11000);
    assert.equal(diagnostic.codeName, "DuplicateKey");
    assert.equal(diagnostic.method, "POST");
    assert.equal(diagnostic.route, "/api/v1/academics/timetable");
    assert.deepEqual(diagnostic.indexFields, ["schoolId", "sectionId", "periodNumber"]);
    assert.equal(diagnostic.index, "schoolId_1_academicSessionId_1_sectionId_1_dayOfWeek_1_periodNumber_1");
    assert.equal(diagnostic.namespace, "schoolflow.timetableentries");
    assert.deepEqual(diagnostic.operation, ["at save (/app/model.js:10:5)", "at handler (/app/route.js:20:3)"]);
    assert.deepEqual(diagnostic.appOperation, ["at save (/app/model.js:10:5)", "at handler (/app/route.js:20:3)"]);

    const serialised = JSON.stringify(diagnostic);
    assert.equal(serialised.includes("duplicate key"), false, "error message must not be logged");
    assert.equal(serialised.includes("TOPSECRET"), false, "tokens/cookies must not be logged");
    assert.equal(serialised.includes("secret"), false, "keyValue document data must not be logged");
});

test("error handler hides details in production but logs safe diagnostics in development", (t) => {
    const consoleMock = t.mock.method(console, "error", () => {});
    const previousEnv = process.env.NODE_ENV;
    try {
        process.env.NODE_ENV = "production";
        const prodError = Object.assign(new Error("connection string mongodb://user:pass@host/db"), {
            name: "MongoServerError",
            code: 7,
            keyValue: { password: "hunter2" }
        });
        const prodRes = makeResponse();
        errorHandler(prodError, { method: "POST" }, prodRes, () => {});
        assert.equal(prodRes.state.status, 500);
        assert.equal(prodRes.state.body.message, "An unexpected server error occurred");
        assert.deepEqual(consoleMock.mock.calls.map(({ arguments: args }) => args), [["Unhandled API error", "MongoServerError"]]);

        consoleMock.mock.resetCalls();
        process.env.NODE_ENV = "development";
        const devError = Object.assign(new Error("secret message"), {
            name: "MongoServerError",
            code: 85,
            codeName: "IndexOptionsConflict",
            keyValue: { token: "hunter2" }
        });
        const devRes = makeResponse();
        errorHandler(devError, {
            method: "POST",
            baseUrl: "/api/v1/academics",
            route: { path: "/timetable" }
        }, devRes, () => {});

        assert.equal(devRes.state.status, 500);
        const logged = consoleMock.mock.calls[0].arguments[1];
        assert.equal(typeof logged, "string", "development log must be structured JSON");
        const diagnostic = JSON.parse(logged);
        assert.equal(diagnostic.code, 85);
        assert.equal(diagnostic.codeName, "IndexOptionsConflict");
        assert.equal(logged.includes("secret message"), false);
        assert.equal(logged.includes("hunter2"), false);
    } finally {
        process.env.NODE_ENV = previousEnv;
    }
});
