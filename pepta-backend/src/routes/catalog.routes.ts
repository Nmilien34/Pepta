import {
  compoundInputSchema,
  compoundPatchSchema,
  cycleInputSchema,
  scheduleInputSchema,
  schedulePatchSchema,
} from "@pepta/shared";
import { Router } from "express";
import { requireAuth } from "../auth/middleware";
import { asyncHandler } from "../lib/async-handler";
import { sendData } from "../lib/responses";
import { createInMemoryRateLimiter } from "../middleware/rate-limit.middleware";
import { validateBody } from "../middleware/validate.middleware";
import {
  createCompound,
  createCycle,
  createSchedule,
  deleteCompound,
  deleteCycle,
  deleteSchedule,
  listCompounds,
  listCycles,
  listMedicationCatalog,
  listResearchArticles,
  listSchedules,
  updateCompound,
  updateSchedule,
} from "../services/catalog.service";

export function createCompoundsRouter() {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/catalog",
    asyncHandler(async (_req, res) => {
      sendData(res, await listMedicationCatalog());
    }),
  );

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      sendData(res, await listCompounds(req.user!.id));
    }),
  );
  router.post(
    "/",
    validateBody(compoundInputSchema),
    asyncHandler(async (req, res) => {
      sendData(res, await createCompound(req.user!.id, req.body), 201);
    }),
  );
  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      sendData(
        res,
        await deleteCompound(req.user!.id, req.params.id as string),
      );
    }),
  );
  router.patch(
    "/:id",
    validateBody(compoundPatchSchema),
    asyncHandler(async (req, res) => {
      sendData(
        res,
        await updateCompound(req.user!.id, req.params.id as string, req.body),
      );
    }),
  );

  return router;
}

export function createSchedulesRouter() {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      sendData(res, await listSchedules(req.user!.id));
    }),
  );
  router.post(
    "/",
    validateBody(scheduleInputSchema),
    asyncHandler(async (req, res) => {
      sendData(res, await createSchedule(req.user!.id, req.body), 201);
    }),
  );
  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      sendData(
        res,
        await deleteSchedule(req.user!.id, req.params.id as string),
      );
    }),
  );
  router.patch(
    "/:id",
    validateBody(schedulePatchSchema),
    asyncHandler(async (req, res) => {
      sendData(
        res,
        await updateSchedule(req.user!.id, req.params.id as string, req.body),
      );
    }),
  );

  return router;
}

export function createCyclesRouter() {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      sendData(res, await listCycles(req.user!.id));
    }),
  );
  router.post(
    "/",
    validateBody(cycleInputSchema),
    asyncHandler(async (req, res) => {
      sendData(res, await createCycle(req.user!.id, req.body), 201);
    }),
  );
  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      sendData(res, await deleteCycle(req.user!.id, req.params.id as string));
    }),
  );

  return router;
}

/**
 * PUBLIC (2026-08-11). Drug names and pharmacological constants are reference
 * data — the same class as /app-config and /legal — and it has to be reachable
 * before sign-in, because onboarding picks a medication at step 7 while the
 * user is still anonymous. Requiring auth here would mean server-controlled
 * half-lives never reach the majority of medication choices. No user data is
 * exposed; rate-limited by IP like the other unauthenticated surfaces.
 */
export function createMedicationCatalogRouter() {
  const router = Router();
  router.use(
    createInMemoryRateLimiter({
      windowMs: 15 * 60 * 1000,
      maxRequests: 60,
      message: "Too many catalog requests",
      keyBy: "userOrIp",
    }),
  );
  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      sendData(res, await listMedicationCatalog());
    }),
  );
  return router;
}

export function createResearchLibraryRouter() {
  const router = Router();
  router.use(requireAuth);
  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      sendData(res, await listResearchArticles());
    }),
  );
  return router;
}
