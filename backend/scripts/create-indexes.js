import "dotenv/config";
import { pathToFileURL } from "node:url";
import mongoose from "mongoose";
import AcademicClass from "../src/models/academic-class.model.js";
import AcademicSession from "../src/models/academic-session.model.js";
import AuditLog from "../src/models/audit-log.model.js";
import ClassSubject from "../src/models/class-subject.model.js";
import ClassTeacherAssignment from "../src/models/class-teacher-assignment.model.js";
import RefreshSession from "../src/models/refresh-session.model.js";
import School from "../src/models/school.model.js";
import Section from "../src/models/section.model.js";
import Subject from "../src/models/subject.model.js";
import Student from "../src/models/student.model.js";
import StudentAcademicHistory from "../src/models/student-academic-history.model.js";
import StudentLeavingCertificate from "../src/models/student-leaving-certificate.model.js";
import StudentAttendance from "../src/models/student-attendance.model.js";
import StaffAttendance from "../src/models/staff-attendance.model.js";
import StudentGuardian from "../src/models/student-guardian.model.js";
import Guardian from "../src/models/guardian.model.js";
import TimetableEntry from "../src/models/timetable-entry.model.js";
import User from "../src/models/user.model.js";
import FeeCategory from "../src/models/fee-category.model.js";
import FeeStructure from "../src/models/fee-structure.model.js";
import StudentFeeAssignment from "../src/models/student-fee-assignment.model.js";
import FeeVoucher from "../src/models/fee-voucher.model.js";
import FeePayment from "../src/models/fee-payment.model.js";
import Exam from "../src/models/exam.model.js";
import ExamMark from "../src/models/exam-mark.model.js";
import CalendarEvent from "../src/models/calendar-event.model.js";
import InventoryItem from "../src/models/inventory-item.model.js";
import InventoryTransaction from "../src/models/inventory-transaction.model.js";
import LibraryBook from "../src/models/library-book.model.js";
import LibraryLoan from "../src/models/library-loan.model.js";
import Announcement from "../src/models/announcement.model.js";
import SubscriptionPlan from "../src/models/subscription-plan.model.js";
import AccountActionToken from "../src/models/account-action-token.model.js";
import FixedAsset from "../src/models/fixed-asset.model.js";
import FixedAssetAssignment from "../src/models/fixed-asset-assignment.model.js";
import FixedAssetDepreciation from "../src/models/fixed-asset-depreciation.model.js";
import FeeReminderDelivery from "../src/models/fee-reminder-delivery.model.js";
import JobRun from "../src/models/job-run.model.js";
import Notification from "../src/models/notification.model.js";
import SchoolDocument from "../src/models/document.model.js";
import Payment from "../src/models/payment.model.js";
import PlatformReceivingAccount from "../src/models/platform-receiving-account.model.js";
import StudentMedia from "../src/models/student-media.model.js";
import StudentMediaAccessLog from "../src/models/student-media-access-log.model.js";
import StudentMediaCleanupTask from "../src/models/student-media-cleanup-task.model.js";
import StudentMediaConsent from "../src/models/student-media-consent.model.js";
import StudentMediaDailyUploadBucket from "../src/models/student-media-daily-upload-bucket.model.js";
import StudentMediaQuota from "../src/models/student-media-quota.model.js";
import StudentMediaUploadReservation from "../src/models/student-media-upload-reservation.model.js";

export const models = [
    School,
    User,
    RefreshSession,
    AuditLog,
    AcademicSession,
    AcademicClass,
    Section,
    Subject,
    ClassSubject,
    ClassTeacherAssignment,
    TimetableEntry,
    Student,
    StudentAcademicHistory,
    StudentLeavingCertificate,
    StudentAttendance,
    StaffAttendance,
    Guardian,
    StudentGuardian,
    FeeCategory,
    FeeStructure,
    StudentFeeAssignment,
    FeeVoucher,
    FeePayment,
    Exam,
    ExamMark,
    CalendarEvent,
    InventoryItem,
    InventoryTransaction,
    LibraryBook,
    LibraryLoan,
    Announcement,
    SubscriptionPlan,
    AccountActionToken,
    FixedAsset,
    FixedAssetAssignment,
    FixedAssetDepreciation,
    FeeReminderDelivery,
    Notification,
    SchoolDocument,
    Payment,
    PlatformReceivingAccount,
    StudentMedia,
    StudentMediaAccessLog,
    StudentMediaCleanupTask,
    StudentMediaConsent,
    StudentMediaDailyUploadBucket,
    StudentMediaQuota,
    StudentMediaUploadReservation,
    JobRun
];

const createIndexes = async () => {
    if (!process.env.MONGO_URI) {
        throw new Error("MONGO_URI is required");
    }

    await mongoose.connect(process.env.MONGO_URI, { autoIndex: false });
    for (const model of models) {
        await model.createIndexes();
        console.info(`Indexes verified for ${model.modelName}`);
    }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        await createIndexes();
    } catch (error) {
        console.error("Index migration failed", error.name ?? "Error");
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
}
