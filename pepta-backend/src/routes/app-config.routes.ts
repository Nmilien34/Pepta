// Public, pre-auth app configuration. GET /app-config/version powers the
// self-maintaining update prompt: it must work on a cold launch before
// sign-in, and it must never 500 — the service degrades to cached or null
// values internally, and any unexpected throw degrades to "show nothing".

import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler';
import { sendData } from '../lib/responses';
import {
  appVersionService,
  type AppVersionService,
  type AppVersionResponse,
} from '../services/app-version.service';

const SHOW_NOTHING: AppVersionResponse = {
  latestVersion: null,
  minimumVersion: null,
  forceUpdate: false,
  title: 'Update available',
  message: 'A new version of Pepta is ready.',
  storeUrl: 'https://apps.apple.com/app/id6784368155',
  source: 'cache',
};

export function createAppConfigRouter(
  service: AppVersionService = appVersionService,
): Router {
  const router = Router();

  router.get(
    '/version',
    asyncHandler(async (_req, res) => {
      let payload: AppVersionResponse;
      try {
        payload = await service.getVersionConfig();
      } catch {
        payload = SHOW_NOTHING;
      }
      sendData(res, payload);
    }),
  );

  return router;
}
