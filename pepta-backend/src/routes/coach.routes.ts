import { pepChatRequestSchema } from "@pepta/shared";
import { Router } from "express";
import { requireAuth } from "../auth/middleware";
import { asyncHandler } from "../lib/async-handler";
import { sendData } from "../lib/responses";
import { createInMemoryRateLimiter } from "../middleware/rate-limit.middleware";
import { validateBody } from "../middleware/validate.middleware";
import { getPepChatReply } from "../services/pepChat.service";

const router = Router();

router.use(requireAuth);

// POST /coach/chat — Pep's back-and-forth chat (OpenAI server-side, grounded
// in the user's own data). Rate-limited: chat is bursty but must not become
// an open LLM relay. GET /coach (AI companion notes) intentionally remains
// unimplemented — the app falls back to its local note engine on 404.
router.post(
  "/chat",
  createInMemoryRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 12,
    message: "Pep needs a breather — try again in a minute",
  }),
  validateBody(pepChatRequestSchema),
  asyncHandler(async (req, res) => {
    sendData(res, await getPepChatReply(req.user!.id, req.body.messages));
  }),
);

export default router;
