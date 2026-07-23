import request from "supertest";
import type { RequestHandler } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteCurrentUser: vi.fn(),
  requireActiveAccess: vi.fn(),
  resolveAccess: vi.fn(),
}));

vi.mock("../middleware/require-active-access", () => ({
  requireActiveAccess: mocks.requireActiveAccess,
}));

vi.mock("../services/access-decision.service", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../services/access-decision.service")
  >()),
  resolveAccess: mocks.resolveAccess,
}));

vi.mock("../services/user.service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/user.service")>()),
  deleteCurrentUser: mocks.deleteCurrentUser,
}));

import { createApp } from "../app";
import { issueSessionJwt } from "../auth/jwt";
import { env } from "../config/env";
import { resetRateLimitStore } from "../middleware/rate-limit.middleware";

describe("Pepta app", () => {
  beforeEach(() => {
    resetRateLimitStore();
    mocks.requireActiveAccess.mockReset();
    mocks.requireActiveAccess.mockImplementation(
      ((_req, _res, next) => next()) as RequestHandler,
    );
    mocks.resolveAccess.mockReset();
    mocks.resolveAccess.mockResolvedValue({ state: "inactive" });
    mocks.deleteCurrentUser.mockReset();
    mocks.deleteCurrentUser.mockResolvedValue(undefined);
  });

  it("serves the public health check", async () => {
    const app = createApp({ healthCheck: async () => true });

    const response = await request(app).get("/healthz").expect(200);

    expect(response.body).toEqual({
      data: {
        status: "ok",
        database: "reachable",
      },
    });
  });

  it("requires auth for protected routes", async () => {
    const app = createApp({ healthCheck: async () => true });

    const response = await request(app).get("/me").expect(401);

    expect(response.body.error.code).toBe("AUTH_MISSING_TOKEN");
  });

  it("keeps webhooks public for external providers", async () => {
    const app = createApp({ healthCheck: async () => true });

    const response = await request(app)
      .post("/webhooks/revenuecat")
      .send({})
      .expect(503);

    expect(response.body.error.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("keeps legal pages public", async () => {
    const app = createApp({ healthCheck: async () => true });

    const terms = await request(app).get("/legal/terms").expect(200);
    const privacy = await request(app).get("/legal/privacy").expect(200);

    expect(terms.text).toContain("Terms of Use for Pepta");
    expect(terms.text).toContain("dev@boltzman.ai");
    expect(terms.text).toContain("not a medical device");
    expect(terms.text).toContain("Acceptance of These Terms");
    expect(terms.text).toContain("App Store Terms of Service");
    expect(terms.text).toContain("Bundle ID: ai.boltzman.peptaapp");
    expect(terms.text.toLowerCase()).not.toContain("free trial");
    expect(privacy.text).toContain("Privacy Policy for Pepta");
    expect(privacy.text).toContain("dev@boltzman.ai");
    expect(privacy.text).toContain("Data We Collect");
    expect(privacy.text).toContain(
      "Camera, Microphone, Photos, and Uploaded Files",
    );
    expect(privacy.text).toContain(
      "AI Features, Product Lookup, and Providers",
    );
    expect(privacy.text).toContain("We do not allow OpenAI or Together AI");
    expect(privacy.text).toContain("general models");
    expect(privacy.text).toContain("Open Food Facts");
    expect(privacy.text).toContain("HealthKit is not currently connected");
    expect(privacy.text).toContain("Data Export and Account Deletion");
    expect(privacy.text).toContain("OpenAI");
    expect(privacy.text).toContain("RevenueCat");
    expect(privacy.text).toContain("Bundle ID: ai.boltzman.peptaapp");
    expect(privacy.text.toLowerCase()).not.toContain("trialing");
  });

  it("handles invalid Apple auth according to current Apple configuration", async () => {
    const app = createApp({ healthCheck: async () => true });
    const expectedStatus = env.apple ? 401 : 503;
    const expectedCode = env.apple
      ? "AUTH_INVALID_TOKEN"
      : "APPLE_SIGN_IN_NOT_AVAILABLE";

    const response = await request(app)
      .post("/auth/apple")
      .send({ identityToken: "apple-token" })
      .expect(expectedStatus);

    expect(response.body.error.code).toBe(expectedCode);
  });

  it("validates demo auth credentials for App Review sign-in", async () => {
    const app = createApp({ healthCheck: async () => true });

    const response = await request(app)
      .post("/auth/demo")
      .send({ email: "review@pepta.app" })
      .expect(400);

    expect(response.body.error.code).toBe("VALIDATION");
    expect(response.body.error.message).toBe(
      "Email and password are required.",
    );
  });

  it("rate limits authentication attempts", async () => {
    const app = createApp({ healthCheck: async () => true });

    for (let index = 0; index < 30; index += 1) {
      await request(app).post("/auth/google").send({}).expect(400);
    }

    const response = await request(app)
      .post("/auth/google")
      .send({})
      .expect(429);

    expect(response.body.error.code).toBe("RATE_LIMITED");
    expect(response.headers["retry-after"]).toBeDefined();
  });

  it("rate limits referral-code attempts per authenticated user", async () => {
    const app = createApp({ healthCheck: async () => true });
    const token = issueSessionJwt("507f1f77bcf86cd799439012");

    for (let index = 0; index < 10; index += 1) {
      await request(app)
        .post("/referrals/claim")
        .set("authorization", `Bearer ${token}`)
        .send({})
        .expect(400);
    }

    const response = await request(app)
      .post("/referrals/claim")
      .set("authorization", `Bearer ${token}`)
      .send({})
      .expect(429);

    expect(response.body.error.code).toBe("RATE_LIMITED");
    expect(response.headers["retry-after"]).toBeDefined();
  });

  it("rate limits authenticated meal intelligence attempts", async () => {
    const app = createApp({ healthCheck: async () => true });
    const token = issueSessionJwt("507f1f77bcf86cd799439011");

    for (let index = 0; index < 20; index += 1) {
      await request(app)
        .post("/meal-scans/analyze")
        .set("authorization", `Bearer ${token}`)
        .send({})
        .expect(400);
    }

    const response = await request(app)
      .post("/meal-scans/analyze")
      .set("authorization", `Bearer ${token}`)
      .send({})
      .expect(429);

    expect(response.body.error.code).toBe("RATE_LIMITED");
    expect(response.headers["retry-after"]).toBeDefined();
  });
});

describe("access route matrix (audit H3)", () => {
  const app = () => createApp({ healthCheck: async () => true });
  const token = issueSessionJwt("507f1f77bcf86cd799439012");

  const premiumRoutes = [
    "/home",
    "/track",
    "/progress",
    "/medication-level",
    "/coach/notes",
    "/insights",
    "/weekly-retention",
    "/diagnostics",
    "/meal-scans",
    "/compounds",
    "/cycles",
    "/schedules",
    "/dose-logs",
    "/weight-logs",
    "/meal-logs",
    "/water-logs",
    "/protein-logs",
    "/fiber-logs",
    "/activity-logs",
    "/side-effect-logs",
    "/measurements",
    "/research-library",
    "/progress-photos",
  ];

  beforeEach(() => {
    resetRateLimitStore();
    mocks.requireActiveAccess.mockReset();
    mocks.requireActiveAccess.mockImplementation(
      ((_req, res) =>
        res.status(403).json({
          error: {
            code: "ENTITLEMENT_REQUIRED",
            message: "Premium access is required",
          },
        })) as RequestHandler,
    );
    mocks.resolveAccess.mockReset();
    mocks.resolveAccess.mockResolvedValue({ state: "inactive" });
    mocks.deleteCurrentUser.mockReset();
    mocks.deleteCurrentUser.mockResolvedValue(undefined);
  });

  it.each(premiumRoutes)("%s reaches the persisted premium guard", async (route) => {
    const response = await request(app())
      .get(route)
      .set("authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ENTITLEMENT_REQUIRED");
    expect(mocks.requireActiveAccess).toHaveBeenCalled();
  });

  it("keeps the recovery/account allowlist reachable without premium access", async () => {
    await request(app()).get("/healthz").expect(200);
    await request(app()).get("/legal/privacy").expect(200);
    await request(app()).post("/auth/google").send({}).expect(400);
    await request(app()).post("/webhooks/revenuecat").send({}).expect(503);
    await request(app())
      .post("/me/access/resolve")
      .set("authorization", `Bearer ${token}`)
      .expect(200);
    await request(app())
      .post("/onboarding/complete")
      .set("authorization", `Bearer ${token}`)
      .send({})
      .expect(400);
    await request(app())
      .post("/referrals/claim")
      .set("authorization", `Bearer ${token}`)
      .send({})
      .expect(400);
    await request(app())
      .delete("/me/account")
      .set("authorization", `Bearer ${token}`)
      .expect(204);

    expect(mocks.requireActiveAccess).not.toHaveBeenCalled();
  });
});
