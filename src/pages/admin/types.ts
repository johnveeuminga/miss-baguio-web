// Results-page print modes. "detailed" = the tabulation-committee view
// (every judge's raw score, per-category Avg + weighted contribution, the
// 20/20 split). "announce" = the emcee view: just Rank, #, Name, Barangay,
// Total — a placement sheet a host can read on air without decoding any
// scoring math.
export type ResultsMode = "detailed" | "announce";

export type PerCategoryScoreDto = {
  categoryId: number;
  categoryName: string;
  averageScore: number;
  weightPercentage: number;
  weightedContribution: number;
  judgeScores?: { judgeId: number; judgeName: string; score: number | null }[];
};

export type CandidateCombinedResultDto = {
  candidateId: number;
  candidateName: string;
  barangay?: string | null;
  photoUrl?: string | null;
  // Field names match the backend's CandidateMorningCoronationDto — was
  // Preliminary*/Finals* before the 2026 "Road to Top 7" rename (see
  // DTOs/CandidateDtos.cs), kept in sync here.
  morningCategories: PerCategoryScoreDto[];
  morningWeightedTotal?: number | null;
  coronationCategories: PerCategoryScoreDto[];
  coronationWeightedTotal?: number | null;
  combinedTotal?: number | null;
  finalRank?: number | null;
};

// From GET /api/results/preliminary/full — a Preliminaries-only tally
// (Q&A + Creative Costume), so it can be reviewed right after Preliminaries
// wraps, before Coronation Night even starts. Judge columns per category
// reflect exactly whoever's actually seated for that category (see
// Category.ExpectedJudgeCount / CategoryJudgeSlot) — an uncapped category
// still lists every judge, a capped one only its claimed seats.
export type CandidateFullTableDto = {
  candidateId: number;
  candidateNo: number;
  candidateName: string;
  categoryScores: PerCategoryScoreDto[];
  weightedTotal?: number | null;
  rank?: number | null;
};

export type Top5Dto = {
  candidateId: number;
  candidateName: string;
  barangay?: string | null;
  photoUrl?: string | null;
  totalScore?: number | null;
  finalRank?: number | null;
  isTop5?: boolean;
  isPeoplesChoice?: boolean;
  title?: string | null;
  specialAwards?: unknown[];
  judgeRankings?: {
    judgeId: number;
    judgeName: string;
    rankPosition: number;
  }[];
};
