// The self-maintaining update endpoint: latestVersion is discovered from
// Apple's iTunes Lookup API, cached ~1h, degrades to last-known-good on
// Apple failure, and to "show nothing" (null) with no cache. Env vars only
// override. The route must never 500.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  createAppVersionService,
  PEPTA_BUNDLE_ID,
} from '../services/app-version.service';
import { createAppConfigRouter } from '../routes/app-config.routes';

const NO_OVERRIDES = {
  minimumVersion: null,
  forceUpdate: false,
  title: null,
  message: null,
  latestVersionOverride: null,
};

function appleOk(version: string, bundleId: string = PEPTA_BUNDLE_ID) {
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({ resultCount: 1, results: [{ bundleId, version }] }),
  })) as unknown as typeof fetch;
}

describe('app-version service', () => {
  it('serves Apple’s version and reports source "apple"', async () => {
    const service = createAppVersionService({
      fetchImpl: appleOk('1.0.4'),
      getOverrides: () => NO_OVERRIDES,
    });
    const config = await service.getVersionConfig();
    expect(config.latestVersion).toBe('1.0.4');
    expect(config.source).toBe('apple');
    expect(config.forceUpdate).toBe(false);
    expect(config.minimumVersion).toBeNull();
    expect(config.storeUrl).toContain('apps.apple.com');
  });

  it('caches for the TTL — a second request does not hit Apple again', async () => {
    const fetchImpl = appleOk('1.0.4');
    let clock = 0;
    const service = createAppVersionService({
      fetchImpl,
      now: () => clock,
      ttlMs: 3_600_000,
      getOverrides: () => NO_OVERRIDES,
    });
    await service.getVersionConfig();
    clock = 3_599_000;
    const second = await service.getVersionConfig();
    expect(second.latestVersion).toBe('1.0.4');
    expect(second.source).toBe('apple');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // Past the TTL it asks Apple again.
    clock = 3_600_001;
    await service.getVersionConfig();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('serves the last known good value when Apple fails, as source "cache"', async () => {
    let fail = false;
    let clock = 0;
    const fetchImpl = vi.fn(async () => {
      if (fail) throw new Error('apple down');
      return {
        ok: true,
        json: async () => ({
          results: [{ bundleId: PEPTA_BUNDLE_ID, version: '1.0.4' }],
        }),
      };
    }) as unknown as typeof fetch;
    const service = createAppVersionService({
      fetchImpl,
      now: () => clock,
      ttlMs: 1_000,
      getOverrides: () => NO_OVERRIDES,
    });
    await service.getVersionConfig();
    fail = true;
    clock = 5_000; // cache expired AND Apple down → stale is better than nothing
    const config = await service.getVersionConfig();
    expect(config.latestVersion).toBe('1.0.4');
    expect(config.source).toBe('cache');
  });

  it('with no cache and Apple down, tells the client to show nothing — never throws', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('apple down');
    }) as unknown as typeof fetch;
    const service = createAppVersionService({
      fetchImpl,
      getOverrides: () => NO_OVERRIDES,
    });
    const config = await service.getVersionConfig();
    expect(config.latestVersion).toBeNull();
    expect(config.source).toBe('cache');
  });

  it('rejects a lookup result for a different bundle id', async () => {
    const service = createAppVersionService({
      fetchImpl: appleOk('9.9.9', 'com.other.app'),
      getOverrides: () => NO_OVERRIDES,
    });
    const config = await service.getVersionConfig();
    expect(config.latestVersion).toBeNull();
  });

  it('env overrides win: PEPTA_LATEST_VERSION skips Apple entirely, source "override"', async () => {
    const fetchImpl = appleOk('1.0.4');
    const service = createAppVersionService({
      fetchImpl,
      getOverrides: () => ({
        minimumVersion: '1.0.2',
        forceUpdate: true,
        title: 'Custom title',
        message: 'Custom message',
        latestVersionOverride: '1.0.5',
      }),
    });
    const config = await service.getVersionConfig();
    expect(config).toMatchObject({
      latestVersion: '1.0.5',
      minimumVersion: '1.0.2',
      forceUpdate: true,
      title: 'Custom title',
      message: 'Custom message',
      source: 'override',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('GET /app-config/version', () => {
  function makeApp(service: Parameters<typeof createAppConfigRouter>[0]) {
    const app = express();
    app.use('/app-config', createAppConfigRouter(service));
    return app;
  }

  it('responds 200 with the config payload', async () => {
    const app = makeApp(
      createAppVersionService({
        fetchImpl: appleOk('1.0.4'),
        getOverrides: () => NO_OVERRIDES,
      }),
    );
    const response = await request(app).get('/app-config/version');
    expect(response.status).toBe(200);
    expect(response.body.data.latestVersion).toBe('1.0.4');
    expect(response.body.data.source).toBe('apple');
  });

  it('responds 200 "show nothing" even if the service itself throws', async () => {
    const broken = {
      getVersionConfig: vi.fn(async () => {
        throw new Error('unexpected');
      }),
    };
    const response = await request(makeApp(broken)).get('/app-config/version');
    expect(response.status).toBe(200);
    expect(response.body.data.latestVersion).toBeNull();
  });
});

describe('PEPTA_* env parsing can never take the server down', () => {
  it('empty-string vars read as unset and boot succeeds; force flag is tolerant but strict', async () => {
    // A var left set-but-empty in the Render dashboard must behave exactly
    // like an unset one — the HMAC keyring incident class, closed here.
    vi.resetModules();
    process.env.PEPTA_LATEST_VERSION = '';
    process.env.PEPTA_MINIMUM_VERSION = '   ';
    process.env.PEPTA_UPDATE_TITLE = '';
    process.env.PEPTA_FORCE_UPDATE = ' TRUE ';
    try {
      const { env } = await import('../config/env');
      expect(env.appUpdate.latestVersionOverride).toBeNull();
      expect(env.appUpdate.minimumVersion).toBeNull();
      expect(env.appUpdate.title).toBeNull();
      // Case/whitespace tolerant…
      expect(env.appUpdate.forceUpdate).toBe(true);
    } finally {
      delete process.env.PEPTA_LATEST_VERSION;
      delete process.env.PEPTA_MINIMUM_VERSION;
      delete process.env.PEPTA_UPDATE_TITLE;
      delete process.env.PEPTA_FORCE_UPDATE;
      vi.resetModules();
    }
    // …but anything that is not "true" stays false: the hard gate must be
    // impossible to arm by accident.
    vi.resetModules();
    process.env.PEPTA_FORCE_UPDATE = 'yes';
    try {
      const { env } = await import('../config/env');
      expect(env.appUpdate.forceUpdate).toBe(false);
    } finally {
      delete process.env.PEPTA_FORCE_UPDATE;
      vi.resetModules();
    }
  });
});

describe('bundle id hygiene', () => {
  it('matches pepta-frontend/app.config.js — the lookup must query OUR app', () => {
    const appConfig = readFileSync(
      join(__dirname, '..', '..', '..', 'pepta-frontend', 'app.config.js'),
      'utf8',
    );
    const match = appConfig.match(/bundleIdentifier:\s*"([^"]+)"/);
    expect(match?.[1]).toBe(PEPTA_BUNDLE_ID);
  });
});
