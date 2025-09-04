// Hardcoded rounds and categories for now (per request)
export const ROUNDS = [
  { id: 2, key: "finals", name: "Finals" },
  { id: 3, key: "top5", name: "Top 5" },
] as const;

export const CATEGORIES = [
  { id: 5, key: "swimsuit_second", name: "Swimsuit (Second)" },
  { id: 6, key: "evening_gown", name: "Evening Gown" },
] as const;

export type Round = (typeof ROUNDS)[number];
export type Category = (typeof CATEGORIES)[number];
