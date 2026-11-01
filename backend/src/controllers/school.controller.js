import { getSchoolProfile, updateSchoolProfile } from "../services/school.service.js";
import { toPublicSchool } from "../services/auth.service.js";
import { HttpError } from "../utils/http-error.js";
import { sendSuccess } from "../utils/responses.js";

export const getCurrentSchool = async (req, res) => {
    const school = await getSchoolProfile(req);
    if (!school) {
        throw new HttpError(404, "School was not found");
    }
    return sendSuccess(res, 200, { school: toPublicSchool(school) });
};

export const updateCurrentSchool = async (req, res) => {
    const school = await updateSchoolProfile(req, req.body);
    if (!school) {
        throw new HttpError(404, "School was not found");
    }
    return sendSuccess(res, 200, { school: toPublicSchool(school) }, "School profile updated");
};
