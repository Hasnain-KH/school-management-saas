import { HttpError } from "../utils/http-error.js";

let provider = null;

export const configureDocumentStorageProvider = (storage) => {
    if (!storage
        || typeof storage.upload !== "function"
        || typeof storage.delete !== "function"
        || typeof storage.createDownloadUrl !== "function") {
        throw new TypeError("Document storage must implement upload, delete, and signed download URLs");
    }
    provider = storage;
};

export const getDocumentStorageProvider = () => {
    if (!provider) {
        throw new HttpError(503, "Document storage is unavailable until a storage provider is configured");
    }
    return provider;
};

export const isDocumentStorageConfigured = () => provider !== null;
