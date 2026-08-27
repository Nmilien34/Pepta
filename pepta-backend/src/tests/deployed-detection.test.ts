// NODE_ENV is a LABEL. Whether you are pointed at production data is a FACT.
//
// The Render deploy of 2026-08-27 booted with:
//   {"port":8080,"env":"development","msg":"[server] Pepta API listening"}
//
// NODE_ENV was never set, so it defaulted to "development" — while serving
// real users off the production database. Everything gated on the label went
// quietly inert:
//
//   - config/env.ts's whole production superRefine returns early, so the
//     JWT_SECRET guard and every requiredProductionKey (including
//     REVENUECAT_SECRET_API_KEY, whose absence used to make every premium
//     route free) were never enforced
//   - logger drops to `debug` on a health app
//   - confirmProductionMutation() in access-admin and media-admin starts with
//     `if (!env.isProduction) return`, so the confirmation that refuses
//     destructive admin writes against production did NOTHING
//
// `looksDeployed` is evidence rather than configuration: a Mongo URI that is
// not local means this process can reach production data, whatever the label
// says. It cannot be forgotten the way an env var can.
import { describe, expect, it } from "vitest";
import { looksDeployed } from "../config/deployed";

describe("deployment is detected from evidence, not from a label", () => {
  it("treats a local database as not deployed", () => {
    expect(looksDeployed("mongodb://127.0.0.1:27017/pepta")).toBe(false);
    expect(looksDeployed("mongodb://localhost:27017/pepta")).toBe(false);
    expect(looksDeployed("mongodb://[::1]:27017/pepta")).toBe(false);
  });

  it("treats a hosted cluster as deployed regardless of NODE_ENV", () => {
    // The exact shape that booted as "development" while serving real users.
    expect(looksDeployed("mongodb+srv://user:pw@cluster0.abcd.mongodb.net/pepta")).toBe(true);
    expect(looksDeployed("mongodb://db.internal.example.com:27017/pepta")).toBe(true);
  });

  it("fails SAFE on an unparseable or empty URI", () => {
    // Unknown must mean "assume production". Guessing "local" here is how a
    // destructive admin script gets waved through against real data.
    expect(looksDeployed("")).toBe(true);
    expect(looksDeployed("not a uri")).toBe(true);
  });
});
