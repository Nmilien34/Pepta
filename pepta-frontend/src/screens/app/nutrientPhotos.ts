// Photos for the nutrient screens and the Home shortcut tiles.
//
// Static imports, not require(): Metro resolves these at build time and the
// vitest asset alias stubs them, so the screens render in tests. A dynamic
// require(`../../assets/nutrients/${key}.jpg`) would break both.
//
// Keys match NutrientFood.key exactly — nutrientPhotos.test.ts enforces it, so
// a food added to the list without a photo fails CI rather than rendering a
// hole on the screen.

import type { ImageSourcePropType } from 'react-native';

import cookieBar from '../../../assets/nutrients/cookie-bar.jpg';
import edamame from '../../../assets/nutrients/edamame.jpg';
import avocado from '../../../assets/nutrients/avocado.jpg';
import almonds from '../../../assets/nutrients/almonds.jpg';
import psyllium from '../../../assets/nutrients/psyllium.jpg';
import chicken from '../../../assets/nutrients/chicken.jpg';
import corePower from '../../../assets/nutrients/core-power.jpg';
import salmon from '../../../assets/nutrients/salmon.jpg';
import cottageCheese from '../../../assets/nutrients/cottage-cheese.jpg';
import eggs from '../../../assets/nutrients/eggs.jpg';
import peanuts from '../../../assets/nutrients/peanuts.jpg';

import shortcutMeals from '../../../assets/shortcuts/meals.jpg';
import shortcutFiber from '../../../assets/shortcuts/fiber.jpg';
import shortcutHydration from '../../../assets/shortcuts/hydration.jpg';
import shortcutRecipes from '../../../assets/shortcuts/recipes.jpg';

export const FOOD_PHOTOS: Record<string, ImageSourcePropType> = {
  'cookie-bar': cookieBar,
  edamame,
  avocado,
  almonds,
  psyllium,
  chicken,
  'core-power': corePower,
  salmon,
  'cottage-cheese': cottageCheese,
  eggs,
  peanuts,
};

export const SHORTCUT_PHOTOS = {
  meals: shortcutMeals,
  fiber: shortcutFiber,
  hydration: shortcutHydration,
  recipes: shortcutRecipes,
} satisfies Record<string, ImageSourcePropType>;
