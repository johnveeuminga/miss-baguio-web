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
