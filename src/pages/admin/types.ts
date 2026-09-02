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
