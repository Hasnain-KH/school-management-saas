// School logo contract shared by validators, services and public serializers.
// Only metadata is stored on the school document; image bytes live in object storage.
export const SCHOOL_LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const SCHOOL_LOGO_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp"];

// Never expose the internal storage key through an API response.
export const toPublicLogo = (logo) => {
    if (!logo?.storageKey) return null;
    return {
        version: logo.version ?? 1,
        contentType: logo.contentType,
        sizeBytes: logo.sizeBytes,
        fileName: logo.fileName,
        updatedAt: logo.updatedAt
    };
};
