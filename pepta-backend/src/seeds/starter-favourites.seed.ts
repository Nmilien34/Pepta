// The "Start with these" offers.
//
// SEEDED ROWS, NOT A CONSTANT IN THE APP. They belong to nobody (userId null)
// and carry a starterKey, so re-seeding corrects one rather than duplicating
// it, and the set can be changed without shipping a build. Saving one copies
// it to the user, so a later correction never rewrites what they kept.
//
// Three, deliberately: enough that an empty screen is not a dead end, few
// enough that it stays a nudge rather than a list to work through.

import { FavouriteModel } from "../models/favourite.model";

export interface StarterFavouriteSeed {
  key: string;
  kind: "food" | "drink";
  name: string;
  portion: string;
  protein?: number;
  calories?: number;
  ounces?: number;
}

export const STARTER_FAVOURITES: readonly StarterFavouriteSeed[] = [
  {
    key: "food:greek-yogurt:1-cup-plain",
    kind: "food",
    name: "Greek yogurt",
    portion: "1 cup, plain",
    protein: 20,
    calories: 140,
  },
  {
    key: "food:chicken-breast:6-oz-grilled",
    kind: "food",
    name: "Chicken breast",
    portion: "6 oz, grilled",
    protein: 54,
    calories: 280,
  },
  {
    key: "drink:water-bottle:16-oz",
    kind: "drink",
    name: "Water bottle",
    portion: "16 oz",
    ounces: 16,
  },
];

export async function seedStarterFavourites(): Promise<void> {
  await Promise.all(
    STARTER_FAVOURITES.map((item) =>
      FavouriteModel.updateOne(
        { starterKey: item.key },
        { $set: { ...item, userId: null, starterKey: item.key, source: "item" } },
        { upsert: true },
      ),
    ),
  );
}
