import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';

describe('Pepta app', () => {
  it('serves the public health check', async () => {
    const app = createApp({ healthCheck: async () => true });

    const response = await request(app).get('/healthz').expect(200);

    expect(response.body).toEqual({
      data: {
        status: 'ok',
        database: 'reachable',
      },
    });
  });

  it('requires auth for protected routes', async () => {
    const app = createApp({ healthCheck: async () => true });

    const response = await request(app).get('/me').expect(401);

    expect(response.body.error.code).toBe('AUTH_MISSING_TOKEN');
  });

  it('keeps webhooks public for external providers', async () => {
    const app = createApp({ healthCheck: async () => true });

    const response = await request(app).post('/webhooks/revenuecat').send({}).expect(503);

    expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });
});
