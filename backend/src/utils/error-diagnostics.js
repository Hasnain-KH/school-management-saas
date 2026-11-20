// Development-only diagnostics for unhandled API errors.
//
// SAFETY CONTRACT: this module deliberately reports only structural metadata.
// It never reads or returns error.message, request bodies, headers, cookies,
// connection strings, or MongoDB write values such as `keyValue` (which can
// contain real document data). Only field NAMES from an index key pattern and
// safe stack frame locations are included.

const MAX_STACK_FRAMES = 6;

export const describeErrorForDevelopment = (error, req) => {
    if (!error || typeof error !== "object") return null;

    const diagnostic = {
        name: typeof error.name === "string" ? error.name : "Error"
    };

    if (Number.isFinite(error.code)) diagnostic.code = error.code;
    if (typeof error.codeName === "string") diagnostic.codeName = error.codeName;

    // Route identity only. Never log originalUrl/query strings because they can
    // carry tokens or search terms.
    const route = [req?.baseUrl, req?.route?.path].filter(Boolean).join("");
    if (typeof req?.method === "string") diagnostic.method = req.method;
    if (route) diagnostic.route = route;

    // Duplicate-key and index errors: field names only, never the offending
    // values held in error.keyValue.
    const keyPattern = error.keyPattern && typeof error.keyPattern === "object" && !Array.isArray(error.keyPattern)
        ? error.keyPattern
        : null;
    if (keyPattern) diagnostic.indexFields = Object.keys(keyPattern);
    if (typeof error.index === "string") diagnostic.index = error.index;
    if (typeof error.namespace === "string") diagnostic.namespace = error.namespace;
    else if (typeof error.ns === "string") diagnostic.namespace = error.ns;
    if (typeof error.collection === "string") diagnostic.collection = error.collection;

    // Mongoose validation failures expose the field path, not the value.
    if (typeof error.path === "string") diagnostic.validationPath = error.path;

    // Stack frames identify the failing operation without document values.
    const frames = typeof error.stack === "string"
        ? error.stack.split("\n").slice(1, 1 + MAX_STACK_FRAMES).map((frame) => frame.trim()).filter(Boolean)
        : [];
    if (frames.length) diagnostic.operation = frames;

    // The first frames are usually MongoDB driver internals. Also report the
    // first application frames so the exact call site of the failing operation
    // is visible without logging any request or document values.
    const appFrames = typeof error.stack === "string"
        ? error.stack.split("\n").slice(1)
            .map((frame) => frame.trim())
            .filter((frame) => frame && !frame.includes("node_modules") && !frame.includes("node:internal") && !frame.includes("(node:"))
            .slice(0, 3)
        : [];
    if (appFrames.length) diagnostic.appOperation = appFrames;

    return diagnostic;
};
