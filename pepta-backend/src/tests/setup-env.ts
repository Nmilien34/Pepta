// Unit tests must be hermetic: config/env runs dotenv against the repo root,
// so whatever secrets a developer keeps locally leak into the test process.
// Two suites rotted this way — the RevenueCat webhook tests made LIVE
// getSubscriber calls whenever .env carried REVENUECAT_SECRET_API_KEY (an
// empty subscriber for the random test id then overwrote the very status
// under assertion), and the complimentary-access tombstone test flipped the
// day the local HMAC keyring became valid JSON. Both failed for weeks while
// the services they covered were correct.
//
// Deleting process.env vars is not enough (config/env re-runs dotenv, which
// re-adds anything missing) and blanking them to "" trips min(1) validation.
// So: let config/env load and validate the real environment first, then
// neuter the PARSED object it exports — every consumer reads `env.…` at call
// time, so this is the single choke point. Tests that need a configured state
// mock the module that reads it, never the environment.
import { env } from "../config/env";

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
const mutable = env as Mutable<typeof env>;

mutable.revenueCat.secretApiKey = undefined;
mutable.revenueCat.webhookSecret = undefined;
mutable.complimentaryAccess.hmacActiveKeyId = undefined;
mutable.complimentaryAccess.hmacKeysJson = undefined;
