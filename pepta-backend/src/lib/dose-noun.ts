// What the user calls taking their medication. Route in, noun out — the
// backend mirror of the frontend's doseNoun so notification titles composed
// on either side read the same. Route missing/undefined reads as injection,
// so existing wording is byte-identical for every injectable user.
export function doseNoun(route: string | null | undefined): "shot" | "dose" {
  return route === "oral" ? "dose" : "shot";
}
