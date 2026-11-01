import { HttpError } from "../utils/http-error.js";

export const notFound = (req, res, next) =>
    next(new HttpError(404, "The requested route was not found"));

export const errorHandler = (error, req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }

    let statusCode = error.statusCode ?? error.status ?? 500;
    let message = error.message;

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
    }

    if (statusCode >= 500) {
        console.error("Unhandled API error", error.name ?? "Error");
        message = "An unexpected server error occurred";
    }

    return res.status(statusCode).json({
        success: false,
        message,
        ...(error.name === "ZodError" && { errors: error.issues.map(({ path, message: issue }) => ({ path, message: issue })) })
    });
};