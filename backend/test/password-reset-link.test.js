import assert from "node:assert/strict";
import test from "node:test";

// The link must follow the deployed frontend origin. This is a fixed synthetic
// token used only to verify query-string construction; it is not a credential.
const syntheticToken = "t".repeat(43);

test("password reset links use the configured frontend origin and preserve the token", async () => {
    const previous = process.env.APP_BASE_URL;
    process.env.APP_BASE_URL = "https://schoolflow.example.test/";
    try {
        const {
            appBaseUrl,
            emailVerificationTemplate,
            passwordResetTemplate
        } = await import("../src/services/email-templates.js");

        assert.equal(appBaseUrl(), "https://schoolflow.example.test");

        const template = passwordResetTemplate({ token: syntheticToken });
        const link = template.text.match(/https?:\/\/\S+/)?.[0];
        assert.ok(link, "the plain-text email must contain the reset link");

        const url = new URL(link);
        assert.equal(url.origin, "https://schoolflow.example.test");
        assert.equal(url.pathname, "/reset-password");
        assert.equal(url.searchParams.get("token"), syntheticToken);
        assert.equal(template.html.includes("/reset-password?token="), true);
        assert.equal(template.html.includes("expires in 30 minutes"), true);

        const verification = emailVerificationTemplate({ token: syntheticToken });
        assert.equal(verification.html.includes("expires in 30 minutes"), true);
        assert.equal(verification.text.includes("expires in 30 minutes"), true);
    } finally {
        if (previous === undefined) delete process.env.APP_BASE_URL;
        else process.env.APP_BASE_URL = previous;
    }
});
