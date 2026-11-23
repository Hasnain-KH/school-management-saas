// Hermetic environment for the default unit-test suite.
// Loaded before any test file or dotenv import so local/production .env values
// can never drive unit tests or open connections to shared infrastructure.
import { fileURLToPath } from "node:url";

process.env.DOTENV_CONFIG_PATH = fileURLToPath(new URL("./.env.test", import.meta.url));
process.env.NODE_ENV = "test";

// The default suite never uses a real Redis endpoint. Integration tests have a
// separate opt-in script that supplies its own dedicated test URL.
delete process.env.RATE_LIMIT_REDIS_URL;
