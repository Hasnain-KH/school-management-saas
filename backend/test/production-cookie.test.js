import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

test("production auth cookies are Secure, HttpOnly, SameSite, and path-scoped", () => {
    const cookieModule = new URL("../src/security/auth-cookies.js", import.meta.url).href;
    const script = `
        const { authCookieNames, setAuthCookies, clearAuthCookies } = await import(${JSON.stringify(cookieModule)});
        const calls = [];
        const response = {
            cookie(name, value, options) { calls.push({ kind: "set", name, options }); },
            clearCookie(name, options) { calls.push({ kind: "clear", name, options }); }
        };
        setAuthCookies(response, { accessToken: "access-test", refreshToken: "refresh-test" });
        clearAuthCookies(response);
        console.log(JSON.stringify({ authCookieNames, calls }));
    `;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
        encoding: "utf8",
        env: {
            ...process.env,
            NODE_ENV: "production",
            MONGO_URI: "mongodb://127.0.0.1:27017/schoolflow-test",
            JWT_ACCESS_SECRET: "production-test-access-secret-long-enough",
            JWT_REFRESH_SECRET: "production-test-refresh-secret-long-enough",
            RATE_LIMIT_REDIS_URL: "redis://127.0.0.1:6379",
            CORS_ORIGINS: "https://schoolflow.example",
            DOTENV_CONFIG_PATH: resolve("unused-test-environment-file.env")
        }
    });

    assert.equal(result.status, 0, result.stderr);
    const { authCookieNames, calls } = JSON.parse(result.stdout);
    assert.match(authCookieNames.access, /^__Secure-/);
    assert.match(authCookieNames.refresh, /^__Secure-/);
    const setCalls = calls.filter(({ kind }) => kind === "set");
    const clearCalls = calls.filter(({ kind }) => kind === "clear");
    assert.deepEqual(setCalls.map(({ options }) => options.path), ["/api/v1", "/api/v1/auth"]);
    assert.deepEqual(clearCalls.map(({ options }) => options.path), ["/api/v1", "/api/v1/auth"]);
    assert.ok([...setCalls, ...clearCalls].every(({ options }) =>
        options.secure && options.httpOnly && options.sameSite === "lax"
    ));
});
