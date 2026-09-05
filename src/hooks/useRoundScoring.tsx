import { useCallback, useEffect, useRef, useState } from "react";
import { get, post } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useScoringHubConnection } from "@/hooks/useScoringHubConnection";
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

type StagedScore = {
  candidateId: number;
  categoryId: number;
  scoreValue: number;
};

// Scores a judge has entered but not yet submitted live only on their own
// device (see debouncedSaveScore). That makes a mid-category tablet crash,
// accidental reload or browser kill a total loss of everything they'd
// entered — so the staging map is mirrored into localStorage on every
// change and restored on mount. Scoped per round so two rounds can't read
// each other's drafts. Wrapped in try/catch throughout: Safari private
// mode throws on write, and a judge losing their drafts is bad but a
// hard crash on the scoring screen mid-event is worse.
function stagedScoresKey(roundId: number): string {
  return `mb-staged-scores-round-${roundId}`;
}

function loadStagedScores(roundId: number): [string, StagedScore][] {
  try {
    const raw = localStorage.getItem(stagedScoresKey(roundId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    // Re-validate rather than trusting the blob: a stale entry from an
    // older shape would otherwise be POSTed verbatim on the next submit.
    return parsed
      .filter(
        (s): s is StagedScore =>
          !!s &&
          typeof s === "object" &&
          typeof (s as StagedScore).candidateId === "number" &&
          typeof (s as StagedScore).categoryId === "number" &&
          typeof (s as StagedScore).scoreValue === "number"
      )
      .map((s) => [`${s.candidateId}-${s.categoryId}`, s]);
  } catch {
    return [];
  }
}

function persistStagedScores(
  roundId: number,
  pending: Map<string, StagedScore>
) {
  try {
    if (pending.size === 0) {
      localStorage.removeItem(stagedScoresKey(roundId));
      return;
    }
    localStorage.setItem(
      stagedScoresKey(roundId),
      JSON.stringify(Array.from(pending.values()))
    );
  } catch {
    // Out of quota or storage disabled — scoring still works in-memory.
  }
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

  // Keys ("<candidateId>-<categoryId>") of scores this judge has entered
  // that have NOT been sent to the server yet. Scores are deliberately held
  // client-side until the judge hits Submit for that category — nothing is
  // POSTed on change (see debouncedSaveScore). A silent background refresh
  // must not overwrite these with the server's older value — see the merge
  // in load().
  const pendingSavesRef = useRef<
    Map<string, { candidateId: number; categoryId: number; scoreValue: number }>
  >(new Map(loadStagedScores(roundId)));

  // `silent` skips the loading-spinner flip — used by the live SignalR
  // refresh below, which must NOT yank a mid-scoring judge's screen to a
  // full-page <LoadingView> every time any judge submits a score. The
  // optimistic local scores stay put; only the authoritative snapshot
  // (submission/lock state especially) is reconciled underneath.
  const load = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const res = (await get(
          `/api/scoring/rounds/${roundId}/my-scores`,
          token ?? undefined
        )) as MyRoundScoresDto;
        // Keep any score the judge is still editing (pending debounced
        // save) — the fresh snapshot has the pre-edit value for it, and
        // letting that win would make their number visibly jump back.
        const pending = pendingSavesRef.current;
        setData(
          pending.size === 0
            ? res
            : {
                ...res,
                candidates: res.candidates.map((c) => ({
                  ...c,
                  scores: c.scores.map((s) => {
                    const p = pending.get(`${c.candidateId}-${s.categoryId}`);
                    return p ? { ...s, scoreValue: p.scoreValue } : s;
                  }),
                })),
              }
        );
      } catch (err) {
        // A silent background refresh that fails shouldn't blow away a
        // working screen with an error view — the next event or the
        // reconnect handler will try again.
        if (!silent) setError(extractErrorMessage(err, "Failed to load scores"));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [roundId, token]
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Live-refresh the judge's own scoresheet — critically, the per-category
  // submission/lock state. Without this, a judge who has one category open
  // (e.g. Creative Costume, locked after they submitted it) and is then
  // auto-jumped to another category when the admin switches the active one
  // keeps a STALE categorySubmissions snapshot: Q&A can show as locked
  // even though this judge never submitted it, until they hard-refresh.
  //
  // "ScoreUpdated" also fires on submit/correction (server broadcasts it
  // from SubmitCategory / RequestCategoryCorrection); "ScoringControl
  // Updated" fires when the admin opens/closes a category. Both are cheap
  // to react to here — one extra my-scores GET — and every other live
  // screen (AdminActiveControl, Scoresheet, Top7ReadinessCard) already
  // listens the same way. A reconnect refetch covers scores/locks that
  // changed while the socket was briefly down on venue WiFi.
  const hubConnection = useScoringHubConnection(token);
  useEffect(() => {
    if (!hubConnection) return;
    const onChanged = () => void load({ silent: true });
    hubConnection.on("ScoreUpdated", onChanged);
    hubConnection.on("ScoringControlUpdated", onChanged);
    hubConnection.onreconnected(onChanged);
    return () => {
      hubConnection.off("ScoreUpdated", onChanged);
      hubConnection.off("ScoringControlUpdated", onChanged);
    };
  }, [hubConnection, load]);

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

  // Scores used to POST on every change (debounced ~300ms per candidate/
  // category, because the Slider fires onValueChange on ~every pixel of a
  // drag and was flooding venue WiFi with 20-50 overlapping requests per
  // gesture — reported live 2026-09-04). They are now staged on the
  // judge's device instead and posted only on Submit, which removes that
  // flood entirely: a drag costs zero requests no matter how long it is.
  //
  // pendingSavesRef (declared at the top of the hook, since the silent
  // live refresh in load() also needs it) holds the staged scores, mirrored
  // into localStorage so a tablet crash mid-category doesn't lose them.

  // savingKeys mirrors which (candidate, category) pairs are currently
  // being posted — only ever non-empty during a submit, since that is the
  // only time scores go over the network.
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());

  // NOTE: despite the name (kept so callers don't all have to change), this
  // no longer posts anything. Scores are staged on the judge's own device
  // and only reach the server when they submit the category — so a judge
  // can freely adjust and re-adjust without every change being visible to the
  // tabulation side, and a mispress is never something an admin has to go
  // clear out of the database.
  //
  // The old onError callback is gone: there is no network call here to
  // fail. Save errors now surface from submitCategory instead.
  function debouncedSaveScore(
    candidateId: number,
    categoryId: number,
    scoreValue: number
  ) {
    // Instant, unthrottled visual update — same as before.
    setLocalScore(candidateId, categoryId, scoreValue);

    const key = `${candidateId}-${categoryId}`;
    pendingSavesRef.current.set(key, { candidateId, categoryId, scoreValue });
    persistStagedScores(roundId, pendingSavesRef.current);
  }

  // Sends staged scores to the server. This is the ONLY place scores are
  // posted — submitCategory calls it immediately before submitting.
  //
  // Pass a categoryId to send just that category's scores (what Submit
  // does — submitting Swimwear must not also push half-finished Evening
  // Wear scores). Omit it to send everything staged for the round.
  //
  // Staged entries are only dropped once their POST has actually
  // succeeded: if the network fails mid-submit the scores stay in
  // localStorage and the judge can retry, rather than being silently lost
  // between a cleared cache and a submit that never landed.
  const flushPendingSaves = useCallback(
    async (categoryId?: number) => {
      const pending = Array.from(pendingSavesRef.current.entries()).filter(
        ([, p]) => categoryId == null || p.categoryId === categoryId
      );
      if (pending.length === 0) return;

      setSavingKeys(new Set(pending.map(([key]) => key)));
      try {
        await Promise.all(
          pending.map(async ([key, p]) => {
            await post("/api/scoring/scores", p, token ?? undefined);
            pendingSavesRef.current.delete(key);
          })
        );
      } finally {
        persistStagedScores(roundId, pendingSavesRef.current);
        setSavingKeys(new Set());
      }
    },
    [token, roundId]
  );

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
    // Scores are staged locally and never posted on change, so this is
    // where the judge's entire category actually reaches the server —
    // scoped to this category so a half-finished other category isn't
    // pushed along with it. If any POST fails, the throw propagates to the
    // caller's toast and the scores stay staged for a retry; the category
    // is NOT marked submitted behind a failed save.
    await flushPendingSaves(categoryId);
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
