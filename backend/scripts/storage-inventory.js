// Read-only storage inventory for legacy-provider discovery.
//
// Safety properties:
//  - Never imports dotenv and never reads MONGO_URI or .env. The URI must be
//    supplied explicitly in the shell as STORAGE_INVENTORY_MONGO_URI.
//  - Requires the literal gate STORAGE_INVENTORY_READONLY=true.
//  - Reuses the project's test-only URI guard: the database name must begin
//    with `schoolflow_test` and non-loopback hosts need the existing explicit
//    remote acknowledgement. Production database names are rejected.
//  - Disables autoIndex and issues only countDocuments() calls. No writes,
//    migrations, uploads, downloads, or deletions are performed.
//  - Prints aggregate counts only: no names, keys, URLs, PII, credentials, or
//    connection strings.
import mongoose from "mongoose";
import { validateMongoTestUri } from "../src/testing/mongo-test-safety.js";
import SchoolDocument from "../src/models/document.model.js";
import School from "../src/models/school.model.js";

const refuse = (reason) => {
    console.info(`inventory: ${reason}`);
    process.exit(0);
};

if (process.env.STORAGE_INVENTORY_READONLY !== "true") {
    refuse("DISABLED (gate: set STORAGE_INVENTORY_READONLY=true)");
}

const uri = process.env.STORAGE_INVENTORY_MONGO_URI;
if (!uri) {
    refuse("NO_SAFE_READONLY_DATABASE");
}

// Throws on a production database name or an unacknowledged remote host.
validateMongoTestUri(uri);

mongoose.set("autoIndex", false);
await mongoose.connect(uri, {
    autoIndex: false,
    readPreference: "secondaryPreferred",
    serverSelectionTimeoutMS: 10000
});

try {
    const documentsMissing = await SchoolDocument.countDocuments({
        $or: [{ storageProvider: { $exists: false } }, { storageProvider: null }]
    });
    const documentsS3 = await SchoolDocument.countDocuments({ storageProvider: "s3" });
    const documentsCloudinary = await SchoolDocument.countDocuments({ storageProvider: "cloudinary" });

    const logoExists = { "logo.storageKey": { $exists: true, $ne: null } };
    const logosMissing = await School.countDocuments({
        ...logoExists,
        $or: [{ "logo.storageProvider": { $exists: false } }, { "logo.storageProvider": null }]
    });
    const logosS3 = await School.countDocuments({ "logo.storageProvider": "s3" });
    const logosCloudinary = await School.countDocuments({ "logo.storageProvider": "cloudinary" });

    console.info("inventory: OK");
    console.info(`documents_missing_storageProvider: ${documentsMissing}`);
    console.info(`documents_s3: ${documentsS3}`);
    console.info(`logos_missing_storageProvider: ${logosMissing}`);
    console.info(`logos_s3: ${logosS3}`);
    console.info(`documents_cloudinary: ${documentsCloudinary}`);
    console.info(`logos_cloudinary: ${logosCloudinary}`);
    console.info(`cloudinary_total: ${documentsCloudinary + logosCloudinary}`);
} finally {
    await mongoose.disconnect();
}
