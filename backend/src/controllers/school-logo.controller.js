import * as logoService from "../services/school-logo.service.js";
import { sendSuccess } from "../utils/responses.js";
import { HttpError } from "../utils/http-error.js";

export const uploadLogo = async (req, res) =>
    sendSuccess(res, 201, await logoService.uploadSchoolLogo(req, req.body), "School logo uploaded");

export const removeLogo = async (req, res) =>
    sendSuccess(res, 200, await logoService.removeSchoolLogo(req), "School logo removed");

// Stream the object through the API instead of exposing a signed URL to the
// browser. This keeps the image same-origin, so the existing strict CSP works
// and no storage credentials or bucket URLs reach the client.
export const getLogo = async (req, res) => {
    const { contentType, version, url } = await logoService.getSchoolLogo(req);
    let response;
    try {
        response = await fetch(url);
    } catch {
        throw new HttpError(502, "The school logo could not be loaded");
    }
    if (!response.ok) throw new HttpError(502, "The school logo could not be loaded");

    const bytes = Buffer.from(await response.arrayBuffer());
    res.set("Content-Type", contentType);
    res.set("Cache-Control", "private, max-age=300");
    res.set("X-Logo-Version", String(version));
    return res.status(200).send(bytes);
};
