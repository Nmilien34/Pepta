import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { issueSessionJwt } from "../auth/jwt";
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

    expect(terms.text).toContain("Pepta Terms");
    expect(privacy.text).toContain("Pepta Privacy");
  });

  it("keeps Apple auth graceful-deferred when Apple env is unset", async () => {
    const app = createApp({ healthCheck: async () => true });

    const response = await request(app)
      .post("/auth/apple")
      .send({ identityToken: "apple-token" })
      .expect(503);

    expect(response.body.error.code).toBe("APPLE_SIGN_IN_NOT_AVAILABLE");
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
