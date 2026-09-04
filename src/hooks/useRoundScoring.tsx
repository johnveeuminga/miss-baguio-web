import { useCallback, useEffect, useRef, useState } from "react";
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

  // The score Slider fires onValueChange on ~every pixel of drag, not once
  // per gesture — a single drag from e.g. 7.0 to 9.5 was firing 20-50+
  // overlapping POST /api/scoring/scores calls. On venue WiFi (higher
  // latency/lower bandwidth than dev machines) that flood of concurrent
  // requests saturates the connection and some come back as a network-level
  // "Failed to fetch" rather than a clean HTTP error — exactly the bug
  // reported live on 2026-09-04.
  //
  // Fix: debounce the actual network call per (candidate, category) pair —
  // each pair gets its own timer so dragging candidate A doesn't cancel or
  // delay a save in flight for candidate B (all candidates render as
  // simultaneous cards on this screen, not a one-at-a-time wizard, so more
  // than one pair can legitimately have a pending save at once). The visible
  // number still updates on every drag tick via setLocalScore above —
  // untouched, so dragging feels exactly as instant as before. Only the
  // network call is coalesced down to the final value, sent ~300ms after
  // the judge's finger settles.
  //
  // pendingSavesRef also backs flushPendingSaves (below), which
  // submitCategory calls before submitting — so a drag that ends right as
  // the judge hits Submit still reaches the server first instead of being
  // silently dropped when its 300ms timer hasn't fired yet.
  const DEBOUNCE_MS = 300;
  const debounceTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingSavesRef = useRef<Map<string, { candidateId: number; categoryId: number; scoreValue: number }>>(new Map());

  // savingKeys mirrors which (candidate, category) pairs currently have a
  // save in flight or pending — RoundScoring.tsx's per-slider spinner reads
  // this instead of managing its own setSavingKey around an awaited call,
  // since the real network call now happens on a detached timer rather
  // than inside the caller's own await.
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());

  function debouncedSaveScore(
    candidateId: number,
    categoryId: number,
    scoreValue: number,
    onError?: (err: unknown) => void
  ) {
    // Instant, unthrottled visual update — same as before.
    setLocalScore(candidateId, categoryId, scoreValue);

    const key = `${candidateId}-${categoryId}`;
    pendingSavesRef.current.set(key, { candidateId, categoryId, scoreValue });
    setSavingKeys((prev) => new Set(prev).add(key));

    const existing = debounceTimersRef.current.get(key);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      debounceTimersRef.current.delete(key);
      const pending = pendingSavesRef.current.get(key);
      if (!pending) return;
      pendingSavesRef.current.delete(key);
      post("/api/scoring/scores", pending, token ?? undefined)
        .catch((err) => {
          onError?.(err);
        })
        .finally(() => {
          setSavingKeys((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        });
    }, DEBOUNCE_MS);

    debounceTimersRef.current.set(key, timer);
  }

  // Sends every score still waiting on its debounce timer right now,
  // skipping the delay — used before a category Submit (so a drag that
  // just ended isn't lost under the completeness check) and on unmount.
  const flushPendingSaves = useCallback(async () => {
    const pending = Array.from(pendingSavesRef.current.values());
    debounceTimersRef.current.forEach((timer) => clearTimeout(timer));
    debounceTimersRef.current.clear();
    pendingSavesRef.current.clear();
    setSavingKeys(new Set());
    await Promise.all(
      pending.map((p) =>
        post("/api/scoring/scores", p, token ?? undefined)
      )
    );
  }, [token]);

  useEffect(() => {
    const timers = debounceTimersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  // Kept for anything still calling it, but no longer what the primary
  // scoring screen uses — submission is now per-category (see
  // submitCategory below), since a judge shouldn't have to wait for every
  // category in the round to be scoreable/complete before submitting the
  // one they've actually finished.
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

  // Submits ONE category independently — doesn't require any other
  // category in the round to be scored or even scoreable.
  async function submitCategory(categoryId: number) {
    // Flush first: a drag that just ended may still be sitting in its
    // 300ms debounce window (see debouncedSaveScore) — without this, the
    // completeness check on the server could run before that last score
    // actually lands, or the score could be lost outright.
    await flushPendingSaves();
    await post(
      `/api/scoring/categories/${categoryId}/submit`,
      {},
      token ?? undefined
    );
    await load();
  }

  async function requestCategoryCorrection(categoryId: number) {
    await post(
      `/api/scoring/categories/${categoryId}/request-correction`,
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

  // Per-category filled/expected count, for the per-category Submit
  // button's own completeness check (mirrors the round-wide totals above,
  // just scoped to one category).
  function categoryProgress(categoryId: number) {
    const expected = data?.candidates.length ?? 0;
    const filled =
      data?.candidates.filter((c) =>
        c.scores.some((s) => s.categoryId === categoryId && s.scoreValue != null)
      ).length ?? 0;
    return { filled, expected, isComplete: expected > 0 && filled === expected };
  }

  function categorySubmission(categoryId: number) {
    return data?.categorySubmissions.find((cs) => cs.categoryId === categoryId) ?? null;
  }

  return {
    data,
    loading,
    error,
    reload: load,
    saveScore,
    debouncedSaveScore,
    flushPendingSaves,
    savingKeys,
    submitRound,
    requestCorrection,
    submitCategory,
    requestCategoryCorrection,
    categoryProgress,
    categorySubmission,
    totalExpected,
    totalFilled,
    isComplete,
  };
}
