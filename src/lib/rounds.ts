// Hardcoded rounds and categories for now (per request).
//
// Miss Baguio 2026 "Road to Top 7" format — matches the seed data in
// miss-baguio-tabulation-api/Data/ApplicationDbContext.cs. No more
// Preliminary/Finals 50/50 split: all 4 categories weigh directly against
// the 100% final total. "morning" = Sep 5 AM (Q&A + Creative Costume,
// scored ahead of Coronation Night); "coronation" = Coronation Night live
// (Swimwear + Evening Wear). Talent and the old Closed Door Interview /
// Swimsuit-first/second split are gone for 2026.
export const ROUNDS = [
  { id: 1, key: "morning", description: "Preliminaries" },
  { id: 2, key: "coronation", description: "Coronation Night" },
  { id: 3, key: "top7", description: "Top 7" },
] as const;

export const CATEGORIES = [
  { id: 1, key: "qa", description: "Q&A" },
  { id: 3, key: "creative_costume", description: "Creative Costume (Western Steampunk)" },
  { id: 5, key: "swimwear", description: "Swimwear" },
  { id: 6, key: "evening_wear", description: "Evening Wear" },
] as const;

export type Round = (typeof ROUNDS)[number];
export type Category = (typeof CATEGORIES)[number];
