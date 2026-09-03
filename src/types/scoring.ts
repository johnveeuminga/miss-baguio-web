import type { Candidate } from "@/types/candidate";

export type ScoringSessionDto = {
  id: string; // GUID
  candidateId: number;
  categoryId: number;
  isLocked: boolean;
  startedAt?: string | null;
  // optional included entities (server may include them)
  candidate?: Candidate;
  category?: {
    id: number;
    key?: string;
    name?: string;
    description?: string;
  } | null;
  hasSubmitted: boolean;
  myScore: number;
  myScoreUpdatedAt: string;
};

export type ScoringLockChanged = {
  sessionId: string;
  isLocked: boolean;
};

export type RealtimeScoreDto = {
  candidateId: number;
  candidateName?: string;
  scoreValue: number;
  judgeNumber?: number;
};

export type ScoreSubmittedDto = {
  sessionId: string;
  candidateId: number;
  judgeNumber?: number;
  scoreValue: number;
  categoryId?: number;
};

// 2026 free-form round scoring — a judge can score/re-score any candidate
// in a round freely until they submit the whole round once (one correction
// allowed after that). See ScoringController.GetMyRoundScores/SubmitRound/
// RequestRoundCorrection.
export type RoundCategoryDto = {
  id: number;
  roundId: number;
  name: string;
  description: string;
  weightPercentage: number;
  minScore: number;
  maxScore: number;
  scoreIncrement: number;
  displayOrder: number;
  isActive: boolean;
};

export type MyCandidateCategoryScoreDto = {
  categoryId: number;
  scoreValue: number | null;
};

export type MyRoundCandidateScoresDto = {
  candidateId: number;
  candidateName: string;
  barangay?: string | null;
  photoUrl?: string | null;
  scores: MyCandidateCategoryScoreDto[];
};

// Admin-controlled category lock — per the Executive Committee, judges can
// freely score any candidate within a round, but only in the ONE category
// admin currently has open (avoids mis-scoring the wrong category from a
// mistap on the category tabs). See ScoringController.SubmitScore's
// ScoringControl.ActiveCategoryId check for the actual server-side gate;
// this DTO is what tells the UI which tab to allow.
export type ScoringControlDto = {
  id: number;
  activeRoundId: number | null;
  activeRoundName?: string | null;
  activeCategoryId: number | null;
  activeCategoryName?: string | null;
  isScoringOpen: boolean;
  isRealtimeDisplayEnabled: boolean;
  updatedByUserId?: number | null;
  updatedByUserName?: string | null;
  updatedAt: string;
};

export type MyRoundScoresDto = {
  roundId: number;
  roundName: string;
  isSubmitted: boolean;
  hasUsedCorrection: boolean;
  // False for Coronation Night — those scores are flashed live on the
  // audience display, so nothing can be reopened after submit, even if
  // hasUsedCorrection is still false. Only Preliminaries ever allows one.
  canRequestCorrection: boolean;
  categories: RoundCategoryDto[];
  candidates: MyRoundCandidateScoresDto[];
};
