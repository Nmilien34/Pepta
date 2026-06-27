import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { issueSessionJwt } from "../auth/jwt";
import { env } from "../config/env";
import { resetRateLimitStore } from "../middleware/rate-limit.middleware";

describe("Pepta app", () => {
  beforeEach(() => {
    resetRateLimitStore();
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
    expect(privacy.text).toContain("Privacy Policy for Pepta");
    expect(privacy.text).toContain("dev@boltzman.ai");
    expect(privacy.text).toContain("Data We Collect");
    expect(privacy.text).toContain(
      "Camera, Microphone, Photos, and Uploaded Files",
    );
    expect(privacy.text).toContain("AI Features and OpenAI");
    expect(privacy.text).toContain(
      "We do not allow OpenAI to use your data to train its general models",
    );
    expect(privacy.text).toContain("HealthKit is not currently connected");
    expect(privacy.text).toContain("Data Export and Account Deletion");
    expect(privacy.text).toContain("OpenAI");
    expect(privacy.text).toContain("RevenueCat");
    expect(privacy.text).toContain("Bundle ID: ai.boltzman.peptaapp");
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
