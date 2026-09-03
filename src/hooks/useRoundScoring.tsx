import { useCallback, useEffect, useState } from "react";
import { get, post } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import type { MyRoundScoresDto } from "@/types/scoring";

// lib/api.ts's handleResponse throws the raw JSON error body (e.g.
// {"message": "Round not found"} from the API), not an Error instance —
// so `err instanceof Error` (the pattern used elsewhere in this codebase)
// never actually matches a real API error and always falls back to a
// generic string, hiding the actual reason. This extracts the real message
// from either shape.
export function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m.length > 0) return m;
  }
  return fallback;
}

/**
 * 2026 free-form round scoring (per the Executive Committee): within a
 * round, a judge can score and re-score ANY candidate, in any category of
 * that round, in any order, as many times as they like — e.g. seeing
 * candidate 2 answer better and going back to adjust candidate 1's earlier
 * score — right up until they hit one final Submit for that round. After
 * Submit, scores lock; exactly one correction (reopen, edit, re-submit) is
 * allowed after that.
 *
 * This replaces the old per-candidate live-session scoring flow (useScoring)
 * for the actual score-entry screen. The admin's ScoringSession ("who's
 * currently on stage") still exists and is still broadcast over SignalR,
 * but is now purely cosmetic — it no longer gates what a judge can score.
 */
export function useRoundScoring(roundId: number) {
  const token = useAuthStore((s) => s.token);
  const [data, setData] = useState<MyRoundScoresDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = (await get(
        `/api/scoring/rounds/${roundId}/my-scores`,
        token ?? undefined
      )) as MyRoundScoresDto;
      setData(res);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load scores"));
    } finally {
      setLoading(false);
    }
  }, [roundId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  // Optimistic local update so the input doesn't visually revert while the
  // save request is in flight — reconciled against the server's response
  // on the next full load() (e.g. after Submit) rather than every keystroke.
  function setLocalScore(
    candidateId: number,
    categoryId: number,
    scoreValue: number
  ) {
    setData((current) => {
      if (!current) return current;
      return {
        ...current,
        candidates: current.candidates.map((c) =>
          c.candidateId !== candidateId
            ? c
            : {
                ...c,
                scores: c.scores.map((s) =>
                  s.categoryId !== categoryId ? s : { ...s, scoreValue }
                ),
              }
        ),
      };
    });
  }

  async function saveScore(
    candidateId: number,
    categoryId: number,
    scoreValue: number
  ) {
    setLocalScore(candidateId, categoryId, scoreValue);
    await post(
      "/api/scoring/scores",
      { candidateId, categoryId, scoreValue },
      token ?? undefined
    );
  }

  async function submitRound() {
    await post(`/api/scoring/rounds/${roundId}/submit`, {}, token ?? undefined);
    await load();
  }

  async function requestCorrection() {
    await post(
      `/api/scoring/rounds/${roundId}/request-correction`,
      {},
      token ?? undefined
    );
    await load();
  }

  const totalExpected = (data?.candidates.length ?? 0) * (data?.categories.length ?? 0);
  const totalFilled =
    data?.candidates.reduce(
      (sum, c) => sum + c.scores.filter((s) => s.scoreValue != null).length,
      0
    ) ?? 0;
  const isComplete = totalExpected > 0 && totalFilled === totalExpected;

  return {
    data,
    loading,
    error,
    reload: load,
    saveScore,
    submitRound,
    requestCorrection,
    totalExpected,
    totalFilled,
    isComplete,
  };
}
