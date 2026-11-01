import { createUser, listUsers, updateUser } from "../services/user.service.js";
import { sendSuccess } from "../utils/responses.js";

export const getUsers = async (req, res) =>
    sendSuccess(res, 200, await listUsers(req, req.query));

export const addUser = async (req, res) =>
    sendSuccess(res, 201, await createUser(req, req.body), "User created");

export const editUser = async (req, res) =>
    sendSuccess(res, 200, await updateUser(req, req.params.id, req.body), "User updated");
