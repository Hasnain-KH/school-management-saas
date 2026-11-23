import { HttpError } from "../utils/http-error.js";
import { describeErrorForDevelopment } from "../utils/error-diagnostics.js";

export const notFound = (req, res, next) =>
    next(new HttpError(404, "The requested route was not found"));

const isTransactionUnsupported = (error) => {
    const text = String(error?.message ?? "");
    return error?.code === 20
        || error?.codeName === "IllegalOperation"
        || /Transaction numbers are only allowed on a replica set member or mongos/i.test(text)
        || /does not support (?:multi-document )?transactions/i.test(text);
};

export const errorHandler = (error, req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }

    let statusCode = error.statusCode ?? error.status ?? 500;
    let message = error.message;
    let safeMessage = false;

    if (error.name === "ZodError") {
        statusCode = 400;
        message = "Request validation failed";
    } else if (error.name === "ValidationError") {
        statusCode = 400;
        message = "Request data is invalid";
    } else if (error.name === "CastError") {
        statusCode = 400;
        message = "A supplied identifier is invalid";
    } else if (error.code === 11000) {
        statusCode = 409;
        message = "A record with the supplied unique value already exists";
    } else if (error.type === "entity.too.large") {
        statusCode = 413;
        message = "Request body is too large";
    } else if (error instanceof SyntaxError && "body" in error) {
        statusCode = 400;
        message = "Request body contains invalid JSON";
    } else if (error.message === "Origin is not allowed by CORS") {
        statusCode = 403;
        message = "Request origin is not allowed";
    } else if (isTransactionUnsupported(error)) {
        // Standalone MongoDB cannot run the transactions required by writes.
        // Report an actionable 503 instead of an opaque 500.
        statusCode = 503;
        message = "This operation requires a database that supports transactions";
        safeMessage = true;
    }

    if (statusCode >= 500) {
        // Production keeps the minimal, safe log. Development adds MongoDB
        // code/codeName, index shape and the failing stack frames so a real
        // driver error can be diagnosed instead of being reduced to a name.
        if (process.env.NODE_ENV !== "production") {
            console.error("Unhandled API error", JSON.stringify(describeErrorForDevelopment(error, req)));
        } else {
            console.error("Unhandled API error", error.name ?? "Error");
        }
        if (!safeMessage) message = "An unexpected server error occurred";
    }

    return res.status(statusCode).json({
        success: false,
        message,
        ...(error.name === "ZodError" && { errors: error.issues.map(({ path, message: issue }) => ({ path, message: issue })) })
    });
};