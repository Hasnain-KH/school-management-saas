import { randomUUID } from "node:crypto";

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

// Accept a caller-supplied ID only when it is a bounded, safe token; otherwise
// generate one. The value is returned as a header so client and server logs can
// be correlated without placing user input in log messages.
export const requestId = (req, res, next) => {
    const supplied = req.get("x-request-id");
    req.id = supplied && SAFE_REQUEST_ID.test(supplied) ? supplied : randomUUID();
    res.setHeader("x-request-id", req.id);
    next();
};
