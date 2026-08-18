import { recipeComposeInputSchema, recipeInputSchema } from '@pepta/shared';
import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { asyncHandler } from '../lib/async-handler';
import { sendData } from '../lib/responses';
import { validateBody } from '../middleware/validate.middleware';
import {
  createRecipe,
  deleteRecipe,
  listRecipes,
} from '../services/recipe.service';
import { composeRecipe } from '../services/recipe-compose.service';

const router = Router();

router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    sendData(res, await listRecipes(req.user!.id));
  }),
);

// Saving a starter as yours comes through here too — the client sends the
// starter's ingredients and gets back a row of its own.
router.post(
  '/',
  validateBody(recipeInputSchema),
  asyncHandler(async (req, res) => {
    sendData(res, await createRecipe(req.user!.id, req.body));
  }),
);

// Proposes a recipe from what the user said or what the scan identified.
// Saves nothing: the client shows the proposal and the user accepts it.
router.post(
  '/compose',
  validateBody(recipeComposeInputSchema),
  asyncHandler(async (req, res) => {
    sendData(res, await composeRecipe(req.body.text, req.body.name));
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await deleteRecipe(req.user!.id, req.params.id as string);
    sendData(res, { ok: true });
  }),
);

export default router;
