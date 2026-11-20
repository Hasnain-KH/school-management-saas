// Real end-to-end API workflow against the isolated QA backend on :5001.
// No API mocks: every request is a real HTTP call processed by the real
// Express app against the local replica set database `schoolflow_test_qa`.
// Email and object storage are local loopback sinks (never real providers).
//
// This script records each step as PASS/FAIL and writes a machine-readable
// report to the QA temp directory. Dummy accounts/data only.
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import mongoose from "mongoose";

const BASE = "http://127.0.0.1:5001/api/v1";
const ORIGIN = "http://127.0.0.1:5174";
const QA_DB = "schoolflow_test_qa";
const QA_URI = "mongodb://127.0.0.1:27018/schoolflow_test_qa?replicaSet=schoolflowqa";
const OUT_DIR = join(tmpdir(), "schoolflow-qa");
const REPORT_FILE = join(OUT_DIR, "real-workflow-report.json");
const PASSWORD = "QaOnlyPassword123!";

const stamp = Date.now().toString(36).toUpperCase();
const email = (label) => `qa-${label}-${stamp}@schoolflow.test`;

const results = [];
const ctx = {};

const record = (name, status, detail) => {
    results.push({ name, status, detail });
    console.info(`${status} ${name}${detail ? ` | ${detail}` : ""}`);
};

// Run a step; failures are captured and the workflow continues where possible.
const step = async (name, fn) => {
    try {
        const detail = await fn();
        record(name, "PASS", typeof detail === "string" ? detail : undefined);
        return detail;
    } catch (error) {
        const validation = error.body?.errors?.map((item) => `${(item.path ?? []).join(".")}:${item.message}`).join(", ");
        const detail = `${error.status ?? ""} ${error.message}${validation ? ` [${validation}]` : ""}`.trim();
        record(name, "FAIL", detail);
        return null;
    }
};

const expect = (condition, message) => {
    if (!condition) throw new Error(message);
};

class Client {
    constructor() {
        this.cookies = new Map();
        this.csrf = null;
    }

    storeCookies(response) {
        for (const raw of response.headers.getSetCookie?.() ?? []) {
            const pair = raw.split(";")[0];
            const index = pair.indexOf("=");
            if (index > 0) this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
        }
    }

    cookieHeader() {
        return [...this.cookies].map(([key, value]) => `${key}=${value}`).join("; ");
    }

    async bootstrap() {
        const response = await fetch(`${BASE}/auth/csrf`, { headers: { origin: ORIGIN } });
        this.storeCookies(response);
        const body = await response.json();
        expect(response.ok && body?.data?.csrfToken, "CSRF bootstrap failed");
        this.csrf = body.data.csrfToken;
        return this;
    }

    async request(method, path, body, expectedStatus) {
        const headers = { origin: ORIGIN };
        if (this.csrf) headers["x-csrf-token"] = this.csrf;
        const cookies = this.cookieHeader();
        if (cookies) headers.cookie = cookies;
        if (body !== undefined) headers["content-type"] = "application/json";

        const response = await fetch(`${BASE}${path}`, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        this.storeCookies(response);
        const text = await response.text();
        let parsed;
        try { parsed = JSON.parse(text); } catch { parsed = text; }

        if (expectedStatus !== undefined) {
            expect(response.status === expectedStatus,
                `expected ${expectedStatus}, got ${response.status}: ${parsed?.message ?? text}`);
            return parsed?.data;
        }
        if (!response.ok) {
            const error = new Error(`${method} ${path} -> ${response.status}: ${parsed?.message ?? text}`);
            error.status = response.status;
            error.body = parsed;
            throw error;
        }
        return parsed?.data;
    }

    get(path, expected) { return this.request("GET", path, undefined, expected); }
    post(path, body, expected) { return this.request("POST", path, body, expected); }
    patch(path, body, expected) { return this.request("PATCH", path, body, expected); }
    put(path, body, expected) { return this.request("PUT", path, body, expected); }
    del(path, expected) { return this.request("DELETE", path, undefined, expected); }

    async login(payload) {
        return this.post("/auth/login", payload);
    }
}

const requireValue = (value, label) => {
    expect(value, `${label} missing from response`);
    return value;
};

const ba64 = (bytes) => Buffer.from(bytes).toString("base64");
// 1x1 transparent PNG — valid magic bytes, tiny payload.
const PNG_1X1 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/wF3wJqWAAAAAElFTkSuQmCC",
    "base64"
);

const main = async () => {
    await mkdir(OUT_DIR, { recursive: true });

    // ---- Platform super admin -------------------------------------------------
    const platform = await new Client().bootstrap();
    await step("platform.login", async () => {
        const data = await platform.login({ email: "qa-platform@schoolflow.test", password: PASSWORD });
        expect(data?.user?.role === "platform_super_admin", "unexpected role");
        ctx.platformUserId = data.user.id;
        return data.user.role;
    });
    await step("platform.me", async () => {
        const data = await platform.get("/auth/me");
        expect(data?.user?.role === "platform_super_admin", "me role mismatch");
        return "platform admin identity confirmed";
    });
    await step("platform.plans.list", async () => {
        const data = await platform.get("/platform/plans");
        const plans = Array.isArray(data) ? data : data?.items ?? [];
        expect(plans.length > 0, "no subscription plans");
        ctx.planCount = plans.length;
        return `${plans.length} plans`;
    });
    await step("platform.create.plan", async () => {
        const plan = await platform.post("/platform/plans", {
            name: `QA Plan ${stamp}`,
            code: `qa-plan-${stamp.slice(-4).toLowerCase()}`,
            description: "Disposable QA plan",
            priceMinor: 1000,
            currency: "USD",
            billingInterval: "monthly",
            trialDurationDays: null,
            limits: { students: null, staff: null, branches: null },
            features: {
                academics: true, students: true, staff: true, attendance: true,
                fees: true, exams: true, calendar: true, inventory: true,
                library: true, notifications: true, reports: true
            },
            isActive: true
        });
        ctx.createdPlanId = plan?.id ?? plan?._id;
        return "plan created";
    });
    await step("platform.schools.list", async () => {
        const data = await platform.get("/platform/schools");
        const schools = Array.isArray(data) ? data : data?.items ?? [];
        return `${schools.length} schools visible to platform admin`;
    });
    await step("platform.logout", async () => {
        await platform.post("/auth/logout", {});
        return "logged out";
    });

    // ---- School registration / admin -----------------------------------------
    const adminEmail = email("admin");
    const schoolSlug = `qa-school-${stamp.toLowerCase()}`;
    await step("school.register", async () => {
        const data = await new Client().bootstrap().then((client) =>
            client.post("/auth/register", {
                schoolName: `QA School ${stamp}`,
                schoolSlug,
                email: adminEmail,
                phone: "5550100",
                adminName: "QA Administrator",
                password: PASSWORD
            }));
        expect(data?.school?.id, "school id missing");
        ctx.schoolId = data.school.id;
        return `school ${data.school.id}`;
    });

    const admin = await new Client().bootstrap();
    await step("admin.login", async () => {
        const data = await admin.login({ schoolSlug, email: adminEmail, password: PASSWORD });
        expect(data?.user?.role === "school_admin", "not school_admin");
        ctx.adminUserId = data.user.id;
        return "school admin logged in";
    });
    await step("admin.me.school", async () => {
        const data = await admin.get("/auth/me");
        expect(data?.school?.id === ctx.schoolId, "school id mismatch in /me");
        expect(data?.user?.schoolId === ctx.schoolId, "user school id mismatch");
        return "tenant identity confirmed";
    });
    await step("admin.school.me", async () => {
        const data = await admin.get("/schools/me");
        expect(data?.school?.id === ctx.schoolId, "school/me mismatch");
        return "school profile read";
    });

    // ---- Academics ------------------------------------------------------------
    await step("academics.branches.ensure", async () => {
        // Registration provisions the default branch; the trial plan limits
        // branches to one, so reuse it instead of creating a second.
        const data = await admin.get("/academics/branches");
        const branches = Array.isArray(data) ? data : data?.items ?? [];
        let branch = branches[0];
        if (!branch) {
            branch = await admin.post("/academics/branches", { name: "Main Campus", code: "MAIN" });
        }
        ctx.branchId = requireValue(branch?.id ?? branch?._id, "branch id");
        return `using branch ${ctx.branchId}`;
    });
    await step("academics.session.create", async () => {
        const data = await admin.post("/academics/sessions", {
            name: `QA Session ${stamp}`, startDate: "2026-01-01", endDate: "2026-12-31"
        });
        ctx.sessionId = requireValue(data?.id ?? data?._id, "session id");
        return "session created";
    });
    await step("academics.session.activate", async () => {
        await admin.post(`/academics/sessions/${ctx.sessionId}/activate`, {});
        return "session activated";
    });
    await step("academics.class.create", async () => {
        const data = await admin.post("/academics/classes", { name: "Grade 1", code: "G1", level: 1 });
        ctx.classId = requireValue(data?.id ?? data?._id, "class id");
        return "class created";
    });
    await step("academics.section.create", async () => {
        const data = await admin.post("/academics/sections", {
            academicSessionId: ctx.sessionId, classId: ctx.classId, branchId: ctx.branchId,
            name: "A", capacity: 30
        });
        ctx.sectionId = requireValue(data?.id ?? data?._id, "section id");
        return "section created";
    });
    await step("academics.subjects.create", async () => {
        const math = await admin.post("/academics/subjects", { name: "Mathematics", code: "MATH", category: "core" });
        const eng = await admin.post("/academics/subjects", { name: "English", code: "ENG", category: "core" });
        ctx.mathSubjectId = requireValue(math?.id ?? math?._id, "math subject id");
        ctx.engSubjectId = requireValue(eng?.id ?? eng?._id, "english subject id");
        return "2 subjects created";
    });

    // ---- Teacher / class subject / timetable (critical path) -------------------
    const teacherEmail = email("teacher");
    await step("users.teacher.create", async () => {
        const data = await admin.post("/users", {
            name: "QA Teacher", email: teacherEmail, phone: "5550101",
            jobTitle: "Teacher", role: "teacher", password: PASSWORD
        });
        ctx.teacherId = requireValue(data?.id ?? data?._id, "teacher id");
        return "teacher created";
    });
    await step("academics.classSubject.assign", async () => {
        const data = await admin.post("/academics/class-subjects", {
            academicSessionId: ctx.sessionId, classId: ctx.classId,
            subjectId: ctx.mathSubjectId, teacherId: ctx.teacherId, periodsPerWeek: 5
        });
        ctx.classSubjectId = requireValue(data?.id ?? data?._id, "class subject id");
        return "class subject assigned (periodsPerWeek=5)";
    });
    await step("academics.classSubject.list.periods", async () => {
        const list = await admin.get(`/academics/class-subjects?academicSessionId=${ctx.sessionId}&classId=${ctx.classId}`);
        const found = (Array.isArray(list) ? list : list?.items ?? []).find((item) => (item.id ?? item._id) === ctx.classSubjectId);
        expect(found, "assigned class subject not found");
        expect(found.periodsPerWeek === 5, `periodsPerWeek not preserved: ${found.periodsPerWeek}`);
        return "periodsPerWeek preserved";
    });
    const ttPayload = {
        academicSessionId: ctx.sessionId, sectionId: ctx.sectionId,
        classSubjectId: ctx.classSubjectId, dayOfWeek: 1, periodNumber: 1,
        startsAt: "08:00", endsAt: "09:00", room: "QA-101"
    };
    ctx.timetablePayload = ttPayload;
    await step("academics.timetable.create (REAL POST)", async () => {
        const data = await admin.post("/academics/timetable", ttPayload);
        ctx.timetableId = requireValue(data?.id ?? data?._id, "timetable id");
        return `timetable entry ${ctx.timetableId}`;
    });
    await step("academics.timetable.list (reload)", async () => {
        const list = await admin.get(`/academics/timetable?academicSessionId=${ctx.sessionId}&sectionId=${ctx.sectionId}`);
        const items = Array.isArray(list) ? list : list?.items ?? [];
        const found = items.find((item) => (item.id ?? item._id) === ctx.timetableId);
        expect(found, "created timetable entry not returned on list");
        expect(found.room === "QA-101" && found.dayOfWeek === 1 && found.periodNumber === 1,
            "timetable fields mismatch");
        return `${items.length} entries; created entry present`;
    });
    await step("academics.timetable.duplicate.conflict", async () => {
        await admin.post("/academics/timetable", ttPayload, 409);
        return "duplicate correctly rejected with 409";
    });

    // ---- Students, guardians, attendance --------------------------------------
    await step("students.admit", async () => {
        const data = await admin.post("/students", {
            admissionNumber: `QA${stamp.slice(-6).toUpperCase()}`,
            firstName: "QaStudent", lastName: "One", dateOfBirth: "2015-05-10",
            gender: "unspecified", branchId: ctx.branchId, academicSessionId: ctx.sessionId,
            classId: ctx.classId, sectionId: ctx.sectionId
        });
        ctx.studentId = requireValue(data?.id ?? data?._id, "student id");
        return "student admitted";
    });
    await step("students.list", async () => {
        const list = await admin.get(`/students?sectionId=${ctx.sectionId}`);
        const items = Array.isArray(list) ? list : list?.items ?? [];
        expect(items.some((s) => (s.id ?? s._id) === ctx.studentId), "student not in list");
        return `${items.length} students`;
    });
    await step("attendance.student.mark (present + late check-in)", async () => {
        const data = await admin.post("/attendance/students", {
            sectionId: ctx.sectionId, date: "2026-11-20",
            records: [{ studentId: ctx.studentId, status: "late", checkIn: "08:15", note: "QA late check-in" }]
        });
        return "attendance marked";
    });
    await step("attendance.student.read.day", async () => {
        const data = await admin.get(`/attendance/students?sectionId=${ctx.sectionId}&date=2026-11-20`);
        const records = Array.isArray(data) ? data : data?.records ?? data?.items ?? [];
        expect(records.length > 0, "attendance record not returned");
        return `${records.length} record(s)`;
    });
    await step("attendance.staff.mark", async () => {
        await admin.post("/attendance/staff", {
            date: "2026-11-20",
            records: [{ userId: ctx.teacherId, status: "present", checkIn: "07:55", checkOut: "15:00" }]
        });
        return "staff attendance marked";
    });

    // ---- Finance --------------------------------------------------------------
    await step("finance.category.create", async () => {
        const data = await admin.post("/finance/categories", { name: "QA Tuition", code: `QAT${stamp.slice(-4)}` });
        ctx.feeCategoryId = requireValue(data?.id ?? data?._id, "fee category id");
        return "fee category created";
    });
    await step("finance.structure.create", async () => {
        const data = await admin.post("/finance/structures", {
            academicSessionId: ctx.sessionId, classId: ctx.classId,
            name: "QA Grade 1 Fees", code: `QAF${stamp.slice(-4)}`, frequency: "monthly",
            dueDay: 10, currency: "USD",
            lineItems: [{ categoryId: ctx.feeCategoryId, name: "Tuition", amountMinor: 100000 }]
        });
        ctx.feeStructureId = requireValue(data?.id ?? data?._id, "fee structure id");
        return "fee structure created";
    });
    await step("finance.assignment.create", async () => {
        await admin.post("/finance/assignments", {
            studentId: ctx.studentId, feeStructureId: ctx.feeStructureId,
            discountAmountMinor: 0, discountBasisPoints: 0, startPeriod: "2026-11"
        });
        return "student fee assigned";
    });
    await step("finance.voucher.generate", async () => {
        const data = await admin.post("/finance/vouchers/generate", {
            feeStructureId: ctx.feeStructureId, period: "2026-11", studentIds: [ctx.studentId]
        });
        expect(data?.generated >= 1, `no vouchers generated: ${JSON.stringify(data)}`);
        // The endpoint returns counts; fetch the persisted voucher to drive payment.
        const list = await admin.get(`/finance/vouchers?studentId=${ctx.studentId}&period=2026-11`);
        const vouchers = Array.isArray(list) ? list : list?.items ?? [];
        ctx.voucherId = requireValue(vouchers[0]?.id ?? vouchers[0]?._id, "voucher id");
        return `generated=${data.generated}, voucher ${ctx.voucherId}`;
    });
    await step("finance.payment.collect", async () => {
        const data = await admin.post(`/finance/vouchers/${ctx.voucherId}/payments`, {
            idempotencyKey: `qa-pay-${stamp}-001`, amountMinor: 100000,
            method: "cash", reference: "QA-CASH-001", note: "QA payment"
        });
        ctx.receiptNumber = data?.payment?.receiptNumber ?? data?.receiptNumber ?? data?.receipt?.receiptNumber;
        return `payment recorded, receipt ${ctx.receiptNumber ?? "?"}`;
    });
    await step("finance.receipt.get", async () => {
        expect(ctx.receiptNumber, "no receipt number from payment");
        const data = await admin.get(`/finance/receipts/${ctx.receiptNumber}`);
        expect(data, "receipt not returned");
        return "receipt retrieved";
    });

    // ---- Exams ----------------------------------------------------------------
    await step("exams.create", async () => {
        const data = await admin.post("/exams", {
            academicSessionId: ctx.sessionId, classId: ctx.classId, name: `QA Mid Term ${stamp}`,
            gradingScale: [{ minPercent: 0, maxPercent: 100, grade: "A", remark: "Pass" }],
            subjects: [{
                classSubjectId: ctx.classSubjectId, examDate: "2026-11-25", startTime: "09:00",
                durationMinutes: 60, maxMarks: 100, passingMarks: 40
            }]
        });
        ctx.examId = requireValue(data?.id ?? data?._id, "exam id");
        return "exam created";
    });
    await step("exams.marks.enter", async () => {
        await admin.post(`/exams/${ctx.examId}/marks`, {
            classSubjectId: ctx.classSubjectId,
            records: [{ studentId: ctx.studentId, marksObtained: 85, remarks: "QA marks" }]
        });
        return "marks entered";
    });
    await step("exams.publish", async () => {
        await admin.post(`/exams/${ctx.examId}/publish`, {});
        return "results published";
    });
    await step("exams.results.get", async () => {
        const data = await admin.get(`/exams/${ctx.examId}/results`);
        const rows = Array.isArray(data) ? data : data?.results ?? data?.items ?? [];
        expect(rows.length > 0, "no results returned");
        return `${rows.length} result row(s)`;
    });
    await step("exams.reportcard.get", async () => {
        const data = await admin.get(`/exams/${ctx.examId}/report-cards/${ctx.studentId}`);
        expect(data, "report card missing");
        return "report card retrieved";
    });

    // ---- Parent link + portal --------------------------------------------------
    const parentEmail = email("parent");
    await step("users.parent.create", async () => {
        const data = await admin.post("/users", {
            name: "QA Parent", email: parentEmail, phone: "5550102", role: "parent", password: PASSWORD
        });
        ctx.parentUserId = requireValue(data?.id ?? data?._id, "parent user id");
        return "parent user created";
    });
    await step("students.guardian.create", async () => {
        const data = await admin.post("/students/guardians", {
            name: "QA Guardian", email: parentEmail, phone: "5550103", relationship: "father"
        });
        ctx.guardianId = requireValue(data?.id ?? data?._id, "guardian id");
        return "guardian created";
    });
    await step("students.guardian.link.account", async () => {
        await admin.put(`/students/guardians/${ctx.guardianId}/account`, { userId: ctx.parentUserId });
        return "guardian linked to parent account";
    });
    await step("students.guardian.link.student", async () => {
        await admin.put(`/students/${ctx.studentId}/guardians/${ctx.guardianId}`, { isPrimary: true });
        return "guardian linked to student";
    });

    const parent = await new Client().bootstrap();
    await step("parent.login", async () => {
        const data = await parent.login({ schoolSlug, email: parentEmail, password: PASSWORD });
        expect(data?.user?.role === "parent", "not parent");
        return "parent logged in";
    });
    await step("parent.portal.students", async () => {
        const data = await parent.get("/portal/parent/students");
        const kids = Array.isArray(data) ? data : data?.students ?? data?.items ?? [];
        expect(kids.some((k) => (k.id ?? k._id ?? k.studentId) === ctx.studentId), "linked child not visible");
        const child = kids.find((k) => (k.id ?? k._id ?? k.studentId) === ctx.studentId);
        expect(child?.className || child?.class?.name, "child class not shown");
        expect(child?.sectionName || child?.section?.name, "child section not shown");
        return `child visible with class/section: ${child.className ?? child.class?.name} / ${child.sectionName ?? child.section?.name}`;
    });
    await step("parent.portal.child.attendance", async () => {
        await parent.get(`/portal/parent/students/${ctx.studentId}/attendance`);
        return "child attendance visible";
    });
    await step("parent.portal.child.fees", async () => {
        await parent.get(`/portal/parent/students/${ctx.studentId}/fees`);
        return "child fees visible";
    });
    await step("parent.portal.child.results", async () => {
        await parent.get(`/portal/parent/students/${ctx.studentId}/results`);
        return "child results visible";
    });
    await step("parent.denied.admin.endpoint", async () => {
        await parent.get("/academics/classes", 403);
        return "parent correctly denied academics";
    });

    // ---- Teacher views (timetable) --------------------------------------------
    const teacher = await new Client().bootstrap();
    await step("teacher.login", async () => {
        const data = await teacher.login({ schoolSlug, email: teacherEmail, password: PASSWORD });
        expect(data?.user?.role === "teacher", "not teacher");
        return "teacher logged in";
    });
    await step("teacher.timetable.view", async () => {
        const list = await teacher.get(`/academics/timetable?academicSessionId=${ctx.sessionId}&sectionId=${ctx.sectionId}`);
        const items = Array.isArray(list) ? list : list?.items ?? [];
        expect(items.some((i) => (i.id ?? i._id) === ctx.timetableId), "teacher cannot see timetable entry");
        return `${items.length} entry(s) visible to teacher`;
    });
    await step("teacher.denied.create.timetable", async () => {
        await teacher.post("/academics/timetable", { ...ttPayload, periodNumber: 9 }, 403);
        return "teacher correctly denied timetable create";
    });

    // ---- Principal ------------------------------------------------------------
    const principalEmail = email("principal");
    await step("users.principal.create", async () => {
        const data = await admin.post("/users", {
            name: "QA Principal", email: principalEmail, phone: "5550104",
            jobTitle: "Principal", role: "principal", password: PASSWORD
        });
        ctx.principalUserId = requireValue(data?.id ?? data?._id, "principal user id");
        return "principal user created";
    });
    const principal = await new Client().bootstrap();
    await step("principal.login", async () => {
        const data = await principal.login({ schoolSlug, email: principalEmail, password: PASSWORD });
        expect(data?.user?.role === "principal", "not principal");
        return "principal logged in";
    });
    await step("principal.timetable.view", async () => {
        const list = await principal.get(`/academics/timetable?academicSessionId=${ctx.sessionId}&sectionId=${ctx.sectionId}`);
        const items = Array.isArray(list) ? list : list?.items ?? [];
        expect(items.some((i) => (i.id ?? i._id) === ctx.timetableId), "principal cannot see timetable");
        return "principal can view timetable";
    });
    await step("principal.dashboard", async () => {
        const data = await principal.get("/reports/dashboard");
        expect(data, "dashboard empty");
        return "principal dashboard loaded";
    });

    // ---- Operations: announcements, calendar, inventory, library, assets ------
    await step("operations.announcement.create", async () => {
        await admin.post("/operations/announcements", {
            title: "QA Announcement", body: "Welcome to QA school",
            audience: ["school_admin", "principal", "teacher", "parent"]
        });
        return "announcement created for all school roles";
    });
    await step("operations.announcement.list", async () => {
        const data = await admin.get("/operations/announcements");
        const items = Array.isArray(data) ? data : data?.items ?? [];
        expect(items.some((a) => a.title === "QA Announcement"),
            `announcement not listed (got ${items.length}: ${items.map((a) => a.title).join("|")})`);
        return `${items.length} announcement(s)`;
    });
    await step("operations.calendar.create", async () => {
        await admin.post("/operations/calendar", {
            title: "QA Holiday", type: "holiday", startsAt: "2026-12-25", endsAt: "2026-12-26",
            audience: ["school_admin", "principal", "teacher", "parent"]
        });
        return "calendar event created";
    });
    await step("operations.calendar.list", async () => {
        await admin.get("/operations/calendar?from=2026-12-01&to=2026-12-31");
        return "calendar events listed";
    });
    await step("operations.inventory.create", async () => {
        const data = await admin.post("/operations/inventory/items", {
            sku: `QASKU${stamp.slice(-4)}`, name: "QA Chalk", category: "Stationery", unit: "box", reorderLevel: 5
        });
        ctx.itemId = requireValue(data?.id ?? data?._id, "inventory item id");
        return "inventory item created";
    });
    await step("operations.inventory.movement", async () => {
        await admin.post(`/operations/inventory/items/${ctx.itemId}/transactions`, {
            type: "received", quantity: 100, reference: "QA-IN-001"
        });
        return "inventory movement recorded";
    });
    await step("operations.library.book.create", async () => {
        const data = await admin.post("/operations/library/books", {
            title: "QA Textbook", author: "QA Author", copiesTotal: 3, isbn: "9780000000001"
        });
        ctx.bookId = requireValue(data?.id ?? data?._id, "book id");
        return "library book created";
    });
    await step("operations.library.loan.issue.return", async () => {
        const loan = await admin.post("/operations/library/loans", {
            bookId: ctx.bookId, studentId: ctx.studentId, dueAt: "2026-12-31", note: "QA loan"
        });
        const loanId = requireValue(loan?.id ?? loan?._id, "loan id");
        await admin.post(`/operations/library/loans/${loanId}/return`, {});
        return "book issued and returned";
    });
    await step("operations.asset.create", async () => {
        const data = await admin.post("/operations/assets", {
            assetTag: `QAAS${stamp.slice(-4)}`, name: "QA Projector", category: "Electronics",
            acquisitionDate: "2026-01-15", costMinor: 5000000, salvageValueMinor: 0,
            currency: "USD", usefulLifeMonths: 60, depreciationMethod: "straight_line"
        });
        expect(data, "asset not created");
        return "fixed asset created";
    });

    // ---- Notifications --------------------------------------------------------
    await step("notifications.list", async () => {
        const data = await admin.get("/notifications");
        const items = Array.isArray(data) ? data : data?.items ?? [];
        return `${items.length} notification(s)`;
    });
    await step("notifications.unread.count", async () => {
        const data = await admin.get("/notifications/unread-count");
        return `unread=${data?.count ?? data?.unread ?? 0}`;
    });
    await step("notifications.mark.all.read", async () => {
        await admin.post("/notifications/read-all", {});
        return "notifications marked read";
    });

    // ---- Documents (real base64 upload -> mock S3 sink) -----------------------
    await step("documents.upload", async () => {
        const data = await admin.post("/documents", {
            title: "QA Document", category: "other", fileName: "qa.png",
            contentType: "image/png", dataBase64: ba64(PNG_1X1)
        });
        ctx.documentId = requireValue(data?.id ?? data?._id, "document id");
        return "document uploaded to mock object storage";
    });
    await step("documents.download", async () => {
        // GET returns a signed URL or stream; just assert a successful response.
        const response = await fetch(`${BASE}/documents/${ctx.documentId}/download`, {
            headers: { origin: ORIGIN, cookie: admin.cookieHeader(), "x-csrf-token": admin.csrf }
        });
        expect(response.ok, `download failed ${response.status}`);
        return `download status ${response.status}`;
    });
    await step("documents.delete", async () => {
        await admin.del(`/documents/${ctx.documentId}`);
        return "document deleted";
    });

    // ---- School logo (upload, replace, read, remove) --------------------------
    await step("school.logo.upload", async () => {
        await admin.post("/schools/me/logo", {
            fileName: "qa-logo.png", contentType: "image/png", dataBase64: ba64(PNG_1X1)
        });
        return "logo uploaded";
    });
    await step("school.logo.get", async () => {
        const response = await fetch(`${BASE}/schools/me/logo`, {
            headers: { origin: ORIGIN, cookie: admin.cookieHeader() }
        });
        expect(response.ok, `logo GET failed ${response.status}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        expect(bytes.subarray(0, 8).equals(PNG_1X1.subarray(0, 8)), "logo bytes mismatch");
        return `logo served (${bytes.length} bytes, PNG magic verified)`;
    });
    await step("school.logo.replace", async () => {
        await admin.post("/schools/me/logo", {
            fileName: "qa-logo-2.png", contentType: "image/png", dataBase64: ba64(PNG_1X1)
        });
        return "logo replaced";
    });
    await step("school.logo.remove", async () => {
        await admin.del("/schools/me/logo");
        return "logo removed";
    });

    // ---- Reports --------------------------------------------------------------
    await step("reports.dashboard", async () => {
        const data = await admin.get("/reports/dashboard");
        expect(data, "dashboard empty");
        return "dashboard report loaded";
    });
    await step("reports.students.records", async () => {
        await admin.get("/reports/students/records");
        return "student records report loaded";
    });

    // ---- Cross-tenant isolation -----------------------------------------------
    const otherSlug = `qa-other-${stamp.toLowerCase()}`;
    const otherEmail = email("other");
    await step("tenant.second.school.register", async () => {
        await new Client().bootstrap().then((c) => c.post("/auth/register", {
            schoolName: `QA Other ${stamp}`, schoolSlug: otherSlug, email: otherEmail,
            adminName: "QA Other Admin", password: PASSWORD
        }));
        return "second school registered";
    });
    const other = await new Client().bootstrap();
    await step("tenant.second.admin.login", async () => {
        await other.login({ schoolSlug: otherSlug, email: otherEmail, password: PASSWORD });
        return "second school admin logged in";
    });
    await step("tenant.cross.school.data.denied", async () => {
        const list = await other.get(`/students?sectionId=${ctx.sectionId}`);
        const items = Array.isArray(list) ? list : list?.items ?? [];
        expect(!items.some((s) => (s.id ?? s._id) === ctx.studentId), "cross-tenant student leak");
        return "other school cannot see first school's student";
    });
    await step("tenant.cross.timetable.denied", async () => {
        const data = await other.get(`/academics/timetable?academicSessionId=${ctx.sessionId}`);
        const items = Array.isArray(data) ? data : data?.items ?? [];
        expect(!items.some((i) => (i.id ?? i._id) === ctx.timetableId), "cross-tenant timetable leak");
        return `other school sees ${items.length} timetable entries, none from first school`;
    });

    // ---- Direct database persistence verification -----------------------------
    await step("db.verify.database.name", async () => {
        expect(QA_URI.includes(QA_DB), "QA URI does not target the QA database");
        return QA_DB;
    });
    await step("db.verify.timetable.persisted", async () => {
        const connection = await mongoose.createConnection(QA_URI, { serverSelectionTimeoutMS: 10000 }).asPromise();
        try {
            expect(connection.db.databaseName === QA_DB, "wrong database");
            const timetables = connection.db.collection("timetableentries");
            const row = await timetables.findOne({ _id: new mongoose.Types.ObjectId(ctx.timetableId) });
            expect(row, "timetable entry not found in MongoDB");
            expect(row.schoolId?.toString() === ctx.schoolId, "timetable schoolId mismatch");
            expect(row.sectionId?.toString() === ctx.sectionId, "timetable sectionId mismatch");
            expect(row.classSubjectId?.toString() === ctx.classSubjectId, "timetable classSubjectId mismatch");
            expect(row.dayOfWeek === 1 && row.periodNumber === 1 && row.room === "QA-101", "timetable field mismatch");
            return `TimetableEntry persisted with schoolId=${row.schoolId}`;
        } finally {
            await connection.close();
        }
    });
    await step("db.verify.audit.persisted", async () => {
        const connection = await mongoose.createConnection(QA_URI, { serverSelectionTimeoutMS: 10000 }).asPromise();
        try {
            const audits = connection.db.collection("auditlogs");
            const count = await audits.countDocuments({ schoolId: new mongoose.Types.ObjectId(ctx.schoolId) });
            expect(count > 0, "no audit logs for school");
            return `${count} audit log(s) persisted`;
        } finally {
            await connection.close();
        }
    });

    const summary = {
        generatedAt: new Date().toISOString(),
        total: results.length,
        passed: results.filter((r) => r.status === "PASS").length,
        failed: results.filter((r) => r.status === "FAIL").length,
        failures: results.filter((r) => r.status === "FAIL"),
        context: {
            schoolId: ctx.schoolId, sessionId: ctx.sessionId, sectionId: ctx.sectionId,
            classSubjectId: ctx.classSubjectId, timetableId: ctx.timetableId,
            studentId: ctx.studentId, examId: ctx.examId
        },
        results
    };
    await writeFile(REPORT_FILE, `${JSON.stringify(summary, null, 2)}\n`);

    // Dummy QA-only identities for the real (unmocked) Playwright run. This
    // file lives in the OS temp dir and is never printed to logs or committed.
    await writeFile(join(OUT_DIR, "playwright-seed.json"), `${JSON.stringify({
        apiBase: BASE,
        schoolSlug,
        adminEmail,
        teacherEmail,
        parentEmail,
        principalEmail,
        platformEmail: process.env.QA_PLATFORM_EMAIL || "qa-platform@schoolflow.test",
        password: PASSWORD,
        schoolId: ctx.schoolId,
        sessionId: ctx.sessionId,
        classId: ctx.classId,
        sectionId: ctx.sectionId,
        classSubjectId: ctx.classSubjectId,
        timetableId: ctx.timetableId,
        studentId: ctx.studentId,
        examId: ctx.examId
    }, null, 2)}\n`);

    console.info(`\nWORKFLOW SUMMARY: ${summary.passed}/${summary.total} PASS, ${summary.failed} FAIL`);
    console.info(`Report: ${REPORT_FILE}`);
};

main().catch((error) => {
    console.error("Workflow runner crashed", error?.name ?? "Error", error?.message ?? error);
    process.exitCode = 1;
});
