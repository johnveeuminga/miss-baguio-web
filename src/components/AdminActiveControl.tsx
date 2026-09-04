import { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { get, post, put, del } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useScoringHubConnection } from "@/hooks/useScoringHubConnection";
import { useScoringControl } from "@/hooks/useScoringControl";
import { extractErrorMessage } from "@/hooks/useRoundScoring";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingView, ErrorView } from "@/components/ui/status-view";
import { toast } from "sonner";
import { CheckCircle2, ChevronRight, Radio, Square, Trophy, AlertTriangle, Star, RefreshCw } from "lucide-react";
import type { Candidate } from "@/types/candidate";
import type { ScoringSessionDto } from "@/types/scoring";

type CategoryDto = {
  id: number;
  roundId: number;
  name: string;
  description: string;
  expectedJudgeCount?: number | null;
};

type RoundDto = {
  id: number;
  name: string;
  description: string;
  categories: CategoryDto[];
};

type PerJudgeScoreDto = {
  judgeId: number;
  judgeNumber: number;
  judgeName: string;
  scoreValue: number;
  updatedAt: string;
};

type SessionSnapshotDto = {
  sessionId: string;
  judgeScores: PerJudgeScoreDto[];
  currentAverage: number;
  countSubmitted: number;
};

type CandidateScoreDto = {
  candidateId: number;
  judgesSubmitted?: number | null;
};

type AssignedJudgeDto = {
  judgeId: number;
  judgeName: string;
  claimedAt: string;
};

type ScoringProgressCategoryDto = {
  categoryId: number;
  expectedJudgeCount: number;
  isCustomJudgeCount: boolean;
  assignedJudges: AssignedJudgeDto[] | null;
  openSlots: number | null;
};

type ScoringProgressRoundDto = {
  roundId: number;
  categories: ScoringProgressCategoryDto[];
};

/**
 * The actual admin control for running scoring live — starts/stops/locks a
 * session against the real endpoints (POST /api/scoring/session/start,
 * /stop, /lock). The previous version of this screen posted to
 * /api/active-candidate, which doesn't exist anywhere in the API; every
 * click silently 404'd. This one is wired to what's actually built and
 * used by the judge-facing FinalsScoring screen (roundId-generic) and
 * JudgeHome's live status cards.
 */
export default function AdminActiveControl() {
  const token = useAuthStore((s) => s.token);

  const [rounds, setRounds] = useState<RoundDto[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [roundId, setRoundId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [candidateId, setCandidateId] = useState<number | null>(null);

  const [activeSession, setActiveSession] = useState<ScoringSessionDto | null>(
    null
  );
  const [sessionLoading, setSessionLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<SessionSnapshotDto | null>(null);
  const [totalJudges, setTotalJudges] = useState<number | null>(null);
  const [completionByCandidate, setCompletionByCandidate] = useState<
    Record<number, number>
  >({});
  const hubConnection = useScoringHubConnection(token);
  const { control: scoringControl, reload: reloadScoringControl } = useScoringControl();

  const selectedRound = rounds.find((r) => r.id === roundId) ?? null;
  const selectedCategory =
    selectedRound?.categories.find((c) => c.id === categoryId) ?? null;

  // The judge count that actually applies to the selected category — its
  // own cap when the admin has set one (e.g. Q&A capped at 5), otherwise
  // the global active-judge count. Every "N/X judges" display in this card
  // must use this, not the raw global totalJudges, or a capped category
  // keeps showing ".../9" even though only 5 can ever score it.
  const effectiveJudgeCount = selectedCategory?.expectedJudgeCount ?? totalJudges;

  // Same idea as effectiveJudgeCount, but for whichever category the live
  // "on stage" session actually belongs to — usually the same as the
  // selected picker category, but not guaranteed (the picker can be moved
  // without re-hitting Go Live), so this is looked up independently rather
  // than assumed to equal effectiveJudgeCount.
  const sessionCategory = activeSession
    ? rounds
        .flatMap((r) => r.categories)
        .find((c) => c.id === activeSession.categoryId)
    : null;
  const sessionJudgeCount = sessionCategory?.expectedJudgeCount ?? totalJudges;

  const [editingJudgeCount, setEditingJudgeCount] = useState(false);
  const [savingJudgeCount, setSavingJudgeCount] = useState(false);
  const skipNextJudgeCountBlurSave = useRef(false);

  const [assignedJudges, setAssignedJudges] = useState<AssignedJudgeDto[]>([]);
  const [showAssignedJudges, setShowAssignedJudges] = useState(false);
  const [releasingSlotFor, setReleasingSlotFor] = useState<number | null>(null);

  const loadAssignedJudges = useCallback(
    async (catId: number) => {
      try {
        const progress = (await get(
          "/api/admin/scoring-progress",
          token ?? undefined
        )) as ScoringProgressRoundDto[];
        const category = progress
          .flatMap((r) => r.categories)
          .find((c) => c.categoryId === catId);
        setAssignedJudges(category?.assignedJudges ?? []);
      } catch {
        // Non-critical — the judges list is just a convenience view; a
        // failed fetch shouldn't block the rest of the card.
        setAssignedJudges([]);
      }
    },
    [token]
  );

  // Refetch whenever the selected category (or its cap) changes, so the
  // occupant list never shows a stale category's judges.
  useEffect(() => {
    if (categoryId != null && selectedCategory?.expectedJudgeCount != null) {
      loadAssignedJudges(categoryId);
    } else {
      setAssignedJudges([]);
      setShowAssignedJudges(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, selectedCategory?.expectedJudgeCount]);

  async function releaseJudgeSlot(judgeId: number) {
    if (!selectedCategory) return;
    setReleasingSlotFor(judgeId);
    try {
      await del(
        `/api/admin/categories/${selectedCategory.id}/judge-slots/${judgeId}`,
        token ?? undefined
      );
      toast.success(`Freed that judge's seat in ${selectedCategory.description}.`);
      await loadAssignedJudges(selectedCategory.id);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Failed to release the judge's seat"));
    } finally {
      setReleasingSlotFor(null);
    }
  }

  // Switching category (or round) mid-edit should never save the typed
  // value against a now-different category — bail out of edit mode instead.
  useEffect(() => {
    setEditingJudgeCount(false);
  }, [categoryId]);

  async function saveExpectedJudgeCount(rawValue: string) {
    if (!selectedCategory) return;
    const trimmed = rawValue.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed !== null && (!Number.isInteger(parsed) || parsed < 1)) {
      toast.error("Judge count must be a whole number of 1 or more (or blank to use the default).");
      return;
    }
    setSavingJudgeCount(true);
    try {
      await put(
        `/api/admin/categories/${selectedCategory.id}/expected-judge-count`,
        { expectedJudgeCount: parsed },
        token ?? undefined
      );
      setRounds((prev) =>
        prev.map((r) =>
          r.id !== selectedCategory.roundId
            ? r
            : {
                ...r,
                categories: r.categories.map((c) =>
                  c.id === selectedCategory.id
                    ? { ...c, expectedJudgeCount: parsed }
                    : c
                ),
              }
        )
      );
      toast.success(
        parsed === null
          ? `${selectedCategory.description} now uses the default judge count.`
          : `${selectedCategory.description} now expects ${parsed} judge${parsed === 1 ? "" : "s"}.`
      );
      setEditingJudgeCount(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Failed to update expected judge count"));
    } finally {
      setSavingJudgeCount(false);
    }
  }

  // Whether the round+category picked above is the one currently open for
  // judges to score — reads the same GET /api/scoring/control this card's
  // Round/Category selects are about to double as the editor for. Was
  // previously a second, separate Round+Category picker (CategoryLockCard)
  // sitting right above this one, which just looked like a confusing
  // duplicate control since both usually pointed at the same round/category
  // anyway — there's no real workflow where "what judges can score" and
  // "who's on stage" should ever differ in this pageant.
  const isThisCategoryOpen =
    scoringControl?.isScoringOpen === true &&
    scoringControl.activeRoundId === roundId &&
    scoringControl.activeCategoryId === categoryId;

  async function toggleCategoryLock() {
    if (!roundId || !categoryId) return;
    setBusy(true);
    try {
      const res = (await put(
        "/api/scoring/control",
        {
          activeRoundId: roundId,
          activeCategoryId: categoryId,
          isScoringOpen: !isThisCategoryOpen,
          isRealtimeDisplayEnabled: scoringControl?.isRealtimeDisplayEnabled ?? false,
        },
        token ?? undefined
      )) as { activeCategoryName?: string | null };
      toast.success(
        isThisCategoryOpen
          ? "Scoring closed — judges can't submit until you open a category again."
          : `${res.activeCategoryName ?? "This category"} is now open for scoring.`
      );
      await reloadScoringControl();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Failed to update scoring lock"));
    } finally {
      setBusy(false);
    }
  }

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [roundsRes, candidatesRes, dashboardRes] = await Promise.all([
        get("/api/scoring/rounds", token ?? undefined),
        get("/api/candidates", token ?? undefined),
        get("/api/admin/dashboard", token ?? undefined).catch(() => null),
      ]);
      const roundsList = (roundsRes ?? []) as RoundDto[];
      setRounds(roundsList);
      setCandidates((candidatesRes ?? []) as Candidate[]);
      if (roundsList.length > 0) {
        setRoundId((prev) => prev ?? roundsList[0].id);
      }
      const total = (dashboardRes as { totalJudges?: number } | null)
        ?.totalJudges;
      if (typeof total === "number") setTotalJudges(total);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  // Default (and reset) category whenever the round changes
  useEffect(() => {
    if (!selectedRound) return;
    setCategoryId(selectedRound.categories[0]?.id ?? null);
  }, [selectedRound]);

  const fetchSnapshot = useCallback(
    async (sessionId: string) => {
      try {
        const snap = (await get(
          `/api/scoring/session/${sessionId}/snapshot`,
          token ?? undefined
        )) as SessionSnapshotDto;
        setSnapshot(snap);
      } catch (err) {
        console.error("Failed to load session snapshot", err);
      }
    },
    [token]
  );

  // Per-candidate "how many judges scored this one" for the current
  // round/category — drives the checkmark in the candidate picker so the
  // admin can see who's already done at a glance instead of relying on
  // memory of who they've clicked through.
  const refreshCompletion = useCallback(async () => {
    if (roundId == null || categoryId == null) {
      setCompletionByCandidate({});
      return;
    }
    try {
      const res = (await get(
        `/api/scoring/scores/${roundId}/${categoryId}`,
        token ?? undefined
      )) as { candidateScores?: CandidateScoreDto[] } | null;
      const map: Record<number, number> = {};
      for (const c of res?.candidateScores ?? []) {
        map[c.candidateId] = c.judgesSubmitted ?? 0;
      }
      setCompletionByCandidate(map);
    } catch (err) {
      console.error("Failed to load category completion", err);
    }
  }, [roundId, categoryId, token]);

  useEffect(() => {
    void refreshCompletion();
  }, [refreshCompletion]);

  const refreshActiveSession = useCallback(async () => {
    if (roundId == null) {
      setActiveSession(null);
      setSnapshot(null);
      return;
    }
    setSessionLoading(true);
    try {
      const session = (await get(
        `/api/scoring/session/active/${roundId}`,
        token ?? undefined
      ).catch((err: unknown) => {
        const status =
          err && typeof err === "object" && "status" in err
            ? Number((err as { status?: unknown }).status)
            : null;
        if (status === 404) return null;
        throw err;
      })) as ScoringSessionDto | null;
      setActiveSession(session);
      // Deliberately NOT syncing the candidate/category pickers from the
      // active session here. This used to call setCandidateId(session.
      // candidateId), which meant: pick a new candidate in the dropdown,
      // then before you click "Switch candidate" the next poll/SignalR
      // refresh silently snaps the picker back to whoever is CURRENTLY
      // live — so the click re-started a session for the same candidate
      // and looked like it did nothing. The picker's job is "what do you
      // want to start next", not "mirror what's live now" (that's what the
      // Current Session panel below already shows).
      if (session) {
        await fetchSnapshot(session.id);
      } else {
        setSnapshot(null);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to check active session"
      );
    } finally {
      setSessionLoading(false);
    }
  }, [roundId, token, fetchSnapshot]);

  useEffect(() => {
    void refreshActiveSession();
  }, [refreshActiveSession]);

  // Sessions are scoped per-round (Morning and Coronation Night can both
  // have a live session running at once, by design — different staff might
  // run each). But this screen only shows the ONE round currently picked
  // in the dropdown above, so without this the admin has no way to notice
  // a session left running on the OTHER round. Tracked separately from
  // activeSession/roundId so it always reflects every round, not just the
  // selected one.
  const [otherActiveSessions, setOtherActiveSessions] = useState<
    { round: RoundDto; session: ScoringSessionDto }[]
  >([]);

  const refreshOtherActiveSessions = useCallback(async () => {
    if (rounds.length === 0) return;
    const results = await Promise.all(
      rounds
        .filter((r) => r.id !== roundId)
        .map(async (r) => {
          const session = (await get(
            `/api/scoring/session/active/${r.id}`,
            token ?? undefined
          ).catch(() => null)) as ScoringSessionDto | null;
          return session ? { round: r, session } : null;
        })
    );
    setOtherActiveSessions(
      results.filter((r): r is { round: RoundDto; session: ScoringSessionDto } => r != null)
    );
  }, [rounds, roundId, token]);

  useEffect(() => {
    void refreshOtherActiveSessions();
  }, [refreshOtherActiveSessions]);

  // Live-refresh the judge progress panel whenever any judge submits a
  // score for the active session — same "ScoreUpdated" SignalR event the
  // judge-facing useScoring hook already listens for, so the admin doesn't
  // need to keep hitting refresh to see who's submitted.
  useEffect(() => {
    if (!hubConnection) return;

    const onScoreUpdated = () => {
      setActiveSession((current) => {
        if (current) void fetchSnapshot(current.id);
        return current;
      });
      void refreshCompletion();
    };

    // Fires whenever ANY round's session starts or stops (see
    // ScoringController.StartSession/StopSession — broadcast to
    // Clients.All, not scoped to one round). Used here to keep the
    // "other round is also live" warning current without polling.
    const onActiveCandidateChanged = () => {
      void refreshOtherActiveSessions();
    };

    hubConnection.on("ScoreUpdated", onScoreUpdated);
    hubConnection.on("ActiveCandidateChanged", onActiveCandidateChanged);

    return () => {
      hubConnection.off("ScoreUpdated", onScoreUpdated);
      hubConnection.off("ActiveCandidateChanged", onActiveCandidateChanged);
    };
  }, [hubConnection, fetchSnapshot, refreshCompletion, refreshOtherActiveSessions]);

  async function startSession() {
    if (!roundId || !categoryId || !candidateId) return;
    setBusy(true);
    try {
      const session = (await post(
        "/api/scoring/session/start",
        { roundId, categoryId, candidateId },
        token ?? undefined
      )) as ScoringSessionDto;
      setActiveSession(session);
      await fetchSnapshot(session.id);
      void refreshCompletion();
      toast.success(
        `Started scoring for ${session.candidate?.name ?? `#${candidateId}`}`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start session");
    } finally {
      setBusy(false);
    }
  }

  async function stopSession() {
    if (!activeSession) return;
    setBusy(true);
    try {
      await post(
        "/api/scoring/session/stop",
        activeSession.id as unknown as Record<string, unknown>,
        token ?? undefined
      );
      setActiveSession(null);
      setSnapshot(null);
      toast.success("Session stopped");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to stop session");
    } finally {
      setBusy(false);
    }
  }

  // The next candidate in roster order after whoever is currently live.
  // Null when we're on the last candidate (or nothing is active), which is
  // what hides the Next Candidate button at the end of a category.
  const nextCandidate = (() => {
    if (!activeSession) return null;
    const idx = candidates.findIndex(
      (c) => c.id === activeSession.candidateId
    );
    if (idx === -1) return null;
    return candidates[idx + 1] ?? null;
  })();

  /**
   * Advances straight to the next candidate in roster order, replacing the
   * dropdown-pick-then-start flow for the common case — the step most
   * likely to go wrong live is scrolling a 16-item list under time
   * pressure. This is independent of Lock: it does NOT lock the current
   * session on your behalf. Lock stays its own explicit action, purely for
   * closing a session to new submissions (e.g. blocking a judge from
   * entering a score too early) — Next Candidate never touches it.
   */
  async function goToNextCandidate() {
    if (!nextCandidate || !roundId || !categoryId) return;
    setBusy(true);
    try {
      const session = (await post(
        "/api/scoring/session/start",
        { roundId, categoryId, candidateId: nextCandidate.id },
        token ?? undefined
      )) as ScoringSessionDto;

      setActiveSession(session);
      setCandidateId(nextCandidate.id);
      await fetchSnapshot(session.id);
      void refreshCompletion();
      toast.success(`Now scoring ${nextCandidate.name}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to advance"
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingView label="Loading admin control…" className="p-8" />;

  if (loadError) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <ErrorView
          title="Couldn't load admin control"
          description={loadError}
          onRetry={loadInitial}
        />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Admin — Active Session Control</h1>
          <p className="text-sm text-muted-foreground">
            Start a session to broadcast a candidate + category to every
            judge live.
          </p>
        </div>
        {/* This is the only place in the app that links to /admin/results —
            it exists and works (results, per-judge Top 7 breakdown, special
            awards, print view) but had no nav path to it at all before. */}
        <Link
          to="/admin/results"
          className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground shrink-0 whitespace-nowrap mt-1"
        >
          View Results →
        </Link>
      </div>

      <Top7ReadinessCard token={token} />
      <PeoplesChoiceCard token={token} candidates={candidates} />

      {/* This screen only shows the ONE round picked in the dropdown below.
          Sessions are independent per round by design (Morning and
          Coronation Night can both be live at once, e.g. different staff
          running each) — but that means a session left running on the
          OTHER round is otherwise invisible here. Surface it explicitly. */}
      {otherActiveSessions.map(({ round, session }) => (
        <button
          key={round.id}
          type="button"
          onClick={() => setRoundId(round.id)}
          className="w-full flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-left hover:bg-amber-500/10"
        >
          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <span className="text-amber-600 font-medium shrink-0">
            Also live:
          </span>
          <span className="truncate">
            {round.description} — {session.candidate?.name ?? `#${session.candidateId}`}
          </span>
          <span className="text-xs text-muted-foreground ml-auto shrink-0">
            View →
          </span>
        </button>
      ))}

      {/* Single column, top to bottom: one merged Round & Category / live
          status card, then the scoresheet. Round & Category comes first —
          it's informational context ("what are we even looking at") — with
          the live session status and actions underneath it in the same
          card, rather than two separate cards competing for top billing.
          Redesigned tablet-first: real touch-target heights (h-11/44px,
          matching the judge-facing RoundScoring screen's own convention)
          instead of the original h-8 desktop-density selects, and each of
          the three concerns (context / scoring gate / live status) gets
          its own clearly separated block instead of three cramped strips. */}
      <div className="space-y-4">
        <Card>
          <CardContent className="pt-5 pb-5 space-y-4">
            {/* Scoring gate — topmost since it's the single most important
                thing admin needs to see/control: can judges submit right
                now, or not. A compact switch + status text instead of the
                previous bordered panel — it's a binary on/off, doesn't
                need that much visual weight, just needs to be unmissable
                at the very top. This is the ONE gate that actually exists
                (the old per-session lock button was dead code — nothing
                checked it — and was removed).
                The label and switch used to share one w-full button, so any
                tap across the whole row — not just the switch — flipped
                scoring on/off; on a tablet, a brush near the label or empty
                row space silently closed scoring mid-event (reported live
                2026-09-04). The label is now a plain, non-interactive span;
                only the switch graphic itself is the button. */}
            <div className="w-full flex items-center justify-between gap-3">
              <span
                className={`font-semibold ${
                  isThisCategoryOpen
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-muted-foreground"
                }`}
              >
                {isThisCategoryOpen ? "Scoring Open" : "Scoring Closed"}
              </span>
              {/* Hand-rolled switch (no Switch primitive in this UI kit
                  yet) — the button's own padding gives it a real ~44px
                  tablet touch target without the hit area spilling out
                  into the label or the rest of the row. */}
              <button
                type="button"
                role="switch"
                aria-checked={isThisCategoryOpen}
                aria-label={isThisCategoryOpen ? "Scoring Open" : "Scoring Closed"}
                disabled={busy || !roundId || !categoryId}
                onClick={toggleCategoryLock}
                className="shrink-0 p-2 -m-2 disabled:opacity-50"
              >
                <span
                  className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors ${
                    isThisCategoryOpen ? "bg-emerald-500" : "bg-muted-foreground/30"
                  }`}
                >
                  <span
                    className={`inline-block size-6 transform rounded-full bg-white shadow transition-transform ${
                      isThisCategoryOpen ? "translate-x-7" : "translate-x-1"
                    }`}
                  />
                </span>
              </button>
            </div>

            {/* Round, Category, Candidate, Go Live — all four together in
                one row on tablet-width screens and wider (a real iPad in
                landscape has plenty of room for this); wraps to two rows
                on anything narrower rather than clipping. Round/Category
                still real dropdowns, just given less relative width since
                they change far less often than the candidate picker. */}
            <div className="flex flex-wrap gap-2.5">
              <Select
                value={roundId != null ? String(roundId) : undefined}
                onValueChange={(v) => setRoundId(Number(v))}
                disabled={busy}
              >
                <SelectTrigger className="h-11 bg-muted border-border w-[9.5rem] shrink-0">
                  <SelectValue placeholder="Round" />
                </SelectTrigger>
                <SelectContent>
                  {rounds.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {r.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={categoryId != null ? String(categoryId) : undefined}
                onValueChange={(v) => setCategoryId(Number(v))}
                disabled={busy || !selectedRound}
              >
                <SelectTrigger className="h-11 bg-muted border-border w-[9.5rem] shrink-0">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {selectedRound?.categories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Per-category judge count override — for rounds like
                  Preliminaries where the panel isn't the full judge roster
                  and can differ category to category (e.g. Q&A judged by 3,
                  Costume by 5). This IS enforced server-side — once this many
                  distinct judges have scored the category, anyone else is
                  refused. Below it, an occupant list (once someone's scored)
                  shows exactly who holds a seat, with a way to free one. */}
              {selectedCategory &&
                (editingJudgeCount ? (
                  <div className="flex h-11 items-center gap-1 rounded-md border border-border bg-muted px-2">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      autoFocus
                      defaultValue={selectedCategory.expectedJudgeCount ?? ""}
                      placeholder="default"
                      disabled={savingJudgeCount}
                      className="w-16 bg-transparent text-sm outline-none"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          // Blur triggers the actual save below — avoids a
                          // double-save from Enter firing save and then the
                          // resulting blur firing it again.
                          (e.target as HTMLInputElement).blur();
                        } else if (e.key === "Escape") {
                          skipNextJudgeCountBlurSave.current = true;
                          setEditingJudgeCount(false);
                        }
                      }}
                      onBlur={(e) => {
                        if (skipNextJudgeCountBlurSave.current) {
                          skipNextJudgeCountBlurSave.current = false;
                          return;
                        }
                        saveExpectedJudgeCount(e.target.value);
                      }}
                    />
                    <span className="text-xs text-muted-foreground">judges</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingJudgeCount(true)}
                    disabled={busy}
                    className="flex h-11 items-center gap-1.5 rounded-md border border-dashed border-border px-3 text-sm text-muted-foreground hover:border-primary hover:text-foreground"
                    title="Set how many judges are expected to score this category"
                  >
                    {selectedCategory.expectedJudgeCount != null
                      ? `${selectedCategory.expectedJudgeCount} judges`
                      : `${totalJudges ?? "?"} judges (default)`}
                  </button>
                ))}

              {selectedCategory?.expectedJudgeCount != null && (
                <button
                  type="button"
                  onClick={() => setShowAssignedJudges((v) => !v)}
                  className="flex h-11 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-muted-foreground hover:text-foreground"
                  title="See which judges hold a seat in this category"
                >
                  {assignedJudges.length}/{selectedCategory.expectedJudgeCount} seated
                  <ChevronRight
                    className={`size-3.5 transition-transform ${showAssignedJudges ? "rotate-90" : ""}`}
                  />
                </button>
              )}
              <Select
                value={candidateId != null ? String(candidateId) : undefined}
                onValueChange={(v) => setCandidateId(Number(v))}
                disabled={busy}
              >
                <SelectTrigger className="h-11 bg-muted border-border flex-1 min-w-[12rem]">
                  <SelectValue placeholder="Pick a candidate…" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((c) => {
                    const submitted = completionByCandidate[c.id] ?? 0;
                    const done =
                      effectiveJudgeCount != null && submitted >= effectiveJudgeCount;
                    // Plain text only — SelectItem's children become the
                    // collapsed trigger's SelectValue content too (via
                    // Radix's ItemText), so icons/badges here would also
                    // show up crammed into the closed dropdown. A
                    // checkmark character degrades cleanly wherever it
                    // ends up.
                    return (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {done ? "✓ " : ""}#{c.id} — {c.name}
                        {effectiveJudgeCount != null
                          ? ` · ${submitted}/${effectiveJudgeCount} judges`
                          : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <Button
                onClick={startSession}
                disabled={
                  busy ||
                  !roundId ||
                  !categoryId ||
                  !candidateId ||
                  // Was candidateId-only, so picking the SAME candidate into
                  // a DIFFERENT category (e.g. Q&A -> Creative Costume for
                  // the same girl, a normal morning-session flow) left this
                  // stuck disabled — the admin had to jump to someone else
                  // and back just to reach the next category. Both must
                  // match the live session for "nothing would change" to
                  // actually be true.
                  (candidateId === activeSession?.candidateId &&
                    categoryId === activeSession?.categoryId)
                }
                variant="outline"
                className="h-11 px-5 shrink-0"
              >
                <Radio className="size-4" />
                Go Live
              </Button>
            </div>

            {showAssignedJudges && selectedCategory?.expectedJudgeCount != null && (
              <div className="mt-2 rounded-md border border-border bg-muted/50 p-2 text-sm">
                {assignedJudges.length === 0 ? (
                  <p className="text-muted-foreground">
                    No seats claimed yet — the first {selectedCategory.expectedJudgeCount}{" "}
                    judge{selectedCategory.expectedJudgeCount === 1 ? "" : "s"} to submit a
                    score here will take them.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {assignedJudges.map((j) => (
                      <li key={j.judgeId} className="flex items-center justify-between gap-2">
                        <span>{j.judgeName}</span>
                        <button
                          type="button"
                          onClick={() => releaseJudgeSlot(j.judgeId)}
                          disabled={releasingSlotFor === j.judgeId}
                          className="text-xs text-destructive hover:underline disabled:opacity-50"
                          title="Free this seat — also removes their scores in this category"
                        >
                          {releasingSlotFor === j.judgeId ? "Releasing…" : "Release seat"}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Live status — who's on stage, with a real photo instead of
                just a name, so it reads at a glance rather than needing to
                be parsed as text. */}
            {sessionLoading ? (
              <div className="text-sm text-muted-foreground px-1">Checking for a live session…</div>
            ) : !activeSession ? (
              <div className="text-sm text-muted-foreground px-1">
                No active session — pick a candidate above to start.
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border-l-4 border-emerald-500 bg-emerald-500/5 p-3 flex-wrap">
                <div className="size-14 rounded-md overflow-hidden shrink-0 bg-muted">
                  {activeSession.candidate?.photoUrl ? (
                    <img
                      src={activeSession.candidate.photoUrl}
                      alt={activeSession.candidate.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-sm font-bold text-muted-foreground">
                      {(activeSession.candidate?.name ?? "?").slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                    <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wide">
                      On stage
                    </span>
                  </div>
                  <div className="font-bold truncate">
                    {activeSession.candidate?.name ?? `Candidate #${activeSession.candidateId}`}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {activeSession.category?.description ?? "—"} ·{" "}
                    {snapshot ? snapshot.countSubmitted : 0}
                    {sessionJudgeCount != null ? `/${sessionJudgeCount}` : ""} submitted
                    {snapshot &&
                      sessionJudgeCount != null &&
                      snapshot.countSubmitted >= sessionJudgeCount && (
                        <CheckCircle2 className="inline size-4 ml-1 text-emerald-600 align-[-3px]" />
                      )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                  {nextCandidate && (
                    <Button onClick={goToNextCandidate} disabled={busy} className="h-11 flex-1 sm:flex-none">
                      Next <ChevronRight className="size-4" /> #{nextCandidate.id}
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    disabled={busy}
                    onClick={stopSession}
                    className="h-11 px-4"
                  >
                    <Square className="size-4" />
                    Stop
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Full scoresheet for the selected round/category — every
            candidate, every judge, in one table, like a real tally sheet.
            Lets the admin (or anyone auditing after) see all 16 rows at a
            glance instead of clicking through candidates one at a time. */}
        {selectedRound &&
          categoryId != null &&
          (() => {
            const selectedCategory = selectedRound.categories.find(
              (c) => c.id === categoryId
            );
            if (!selectedCategory) return null;
            return (
              <Scoresheet
                roundName={selectedRound.name}
                roundLabel={selectedRound.description}
                categoryName={selectedCategory.name}
                categoryLabel={selectedCategory.description}
                totalJudges={selectedCategory.expectedJudgeCount ?? totalJudges}
                token={token}
              />
            );
          })()}
      </div>
    </div>
  );
}

type JudgeScoreCell = {
  judgeId: number;
  judgeName: string;
  score: number | null;
};

type ScoresheetRow = {
  candidateId: number;
  candidateNo: number;
  candidateName: string;
  judgeScores: JudgeScoreCell[];
  totalScore: number | null;
  rank: number | null;
};

/**
 * GetScoresTable is keyed by round/category NAME (e.g. "morning", "qa"),
 * not id — confirmed against the API's [FromQuery] string round/category
 * signature — so this takes the name strings, not the numeric ids used
 * elsewhere on this screen for session/start etc.
 */
function Scoresheet({
  roundName,
  roundLabel,
  categoryName,
  categoryLabel,
  totalJudges,
  token,
}: {
  roundName: string;
  roundLabel: string;
  categoryName: string;
  categoryLabel: string;
  totalJudges: number | null;
  token: string | null | undefined;
}) {
  const [rows, setRows] = useState<ScoresheetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Collapsed by default — the full 16-row x 9-judge table is a lot of
  // visual weight to show at all times when most of the screen's actual
  // work happens in the session-control card above it. The header stays
  // clickable and shows a one-line summary even while collapsed.
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = (await get(
        `/api/results/table?round=${encodeURIComponent(
          roundName
        )}&category=${encodeURIComponent(categoryName)}`,
        token ?? undefined
      )) as ScoresheetRow[] | null;
      setRows(res ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [roundName, categoryName, token]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live-refresh as judges submit, same shared hub connection driving the
  // rest of this screen (see useScoringHubConnection — one socket per token,
  // not one per component).
  const hubConnection = useScoringHubConnection(token);
  useEffect(() => {
    if (!hubConnection) return;
    const onScoreUpdated = () => void load();
    hubConnection.on("ScoreUpdated", onScoreUpdated);
    return () => {
      hubConnection.off("ScoreUpdated", onScoreUpdated);
    };
  }, [hubConnection, load]);

  const judgeNames = rows[0]?.judgeScores.map((j) => j.judgeName) ?? [];
  const completeCount = rows.filter((row) => {
    const submitted = row.judgeScores.filter((j) => j.score != null).length;
    return totalJudges != null && submitted >= totalJudges;
  }).length;

  return (
    <Card>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-6 py-4 text-left hover:bg-muted/40 transition-colors rounded-t-xl"
      >
        <span className="font-semibold flex items-center gap-2 min-w-0">
          <ChevronRight
            className={`size-4 shrink-0 transition-transform ${
              expanded ? "rotate-90" : ""
            }`}
          />
          <span className="truncate">
            Scoresheet — {roundLabel} · {categoryLabel}
          </span>
        </span>
        <span className="text-xs text-muted-foreground shrink-0">
          {loading
            ? "Refreshing…"
            : rows.length > 0
            ? `${completeCount}/${rows.length} complete`
            : null}
        </span>
      </button>
      {expanded && (
      <CardContent>
        {error ? (
          <ErrorView
            title="Couldn't load scoresheet"
            description={error}
            onRetry={load}
          />
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No candidates found.
          </div>
        ) : (
          <div className="overflow-x-auto -mx-6 px-6">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-3 font-medium sticky left-0 bg-card">
                    #
                  </th>
                  <th className="text-left py-2 pr-4 font-medium sticky left-6 bg-card min-w-[10rem]">
                    Candidate
                  </th>
                  {judgeNames.map((name, i) => (
                    <th
                      key={i}
                      className="text-center py-2 px-2 font-medium text-muted-foreground whitespace-nowrap"
                    >
                      {name}
                    </th>
                  ))}
                  <th className="text-center py-2 px-3 font-medium">Avg</th>
                  <th className="text-center py-2 pl-3 font-medium">Rank</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const submittedCount = row.judgeScores.filter(
                    (j) => j.score != null
                  ).length;
                  const complete =
                    totalJudges != null && submittedCount >= totalJudges;
                  return (
                    <tr
                      key={row.candidateId}
                      className="border-b last:border-b-0"
                    >
                      <td className="py-2 pr-3 text-muted-foreground sticky left-0 bg-card">
                        {complete ? "✓" : row.candidateNo}
                      </td>
                      <td className="py-2 pr-4 font-medium sticky left-6 bg-card">
                        {row.candidateName}
                      </td>
                      {row.judgeScores.map((j) => (
                        <td
                          key={j.judgeId}
                          className="text-center py-2 px-2 text-muted-foreground"
                        >
                          {j.score != null ? j.score.toFixed(1) : "—"}
                        </td>
                      ))}
                      <td className="text-center py-2 px-3 font-semibold">
                        {row.totalScore != null
                          ? row.totalScore.toFixed(2)
                          : "—"}
                      </td>
                      <td className="text-center py-2 pl-3 text-muted-foreground">
                        {row.rank ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
      )}
    </Card>
  );
}

type MissingScoreEntry = {
  candidateName: string;
  categoryName: string;
  roundName: string;
  judgesSubmitted: number;
  totalJudges: number;
};

type Top7ReadinessDto = {
  isReady: boolean;
  totalCandidates: number;
  totalCategories: number;
  totalJudges: number;
  missing: MissingScoreEntry[];
  isTop7Open: boolean;
};

/**
 * "Is every candidate scored in every category by every judge yet?" — and
 * the one button that actually opens Top 7 for judges. Before this is
 * pressed, GetTop5Candidates (the judge-facing Top 7 endpoint) returns 403
 * regardless of how complete the scores are, so two judges can't open the
 * tab at different times and see two different rankings.
 */
function Top7ReadinessCard({ token }: { token: string | null | undefined }) {
  const [status, setStatus] = useState<Top7ReadinessDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = (await get(
        "/api/admin/top7-readiness",
        token ?? undefined
      )) as Top7ReadinessDto;
      setStatus(res);
    } catch (err) {
      console.error("Failed to load Top 7 readiness", err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live-refresh as judges submit anywhere in the app — shared hub
  // connection (see useScoringHubConnection), not a dedicated socket.
  const hubConnection = useScoringHubConnection(token);
  useEffect(() => {
    if (!hubConnection) return;
    const onScoreUpdated = () => void load();
    hubConnection.on("ScoreUpdated", onScoreUpdated);
    return () => {
      hubConnection.off("ScoreUpdated", onScoreUpdated);
    };
  }, [hubConnection, load]);

  async function finalize() {
    setBusy(true);
    try {
      await post("/api/admin/finalize-top7", {}, token ?? undefined);
      toast.success("Top 7 is now open for judges.");
      await load();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to finalize Top 7"
      );
    } finally {
      setBusy(false);
    }
  }

  async function reopen() {
    setBusy(true);
    try {
      await post("/api/admin/reopen-scoring", {}, token ?? undefined);
      toast.success("Top 7 closed — scoring can resume.");
      await load();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to reopen scoring"
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading || !status) {
    return (
      <div className="text-sm text-muted-foreground px-1">
        Checking Top 7 readiness…
      </div>
    );
  }

  if (status.isTop7Open) {
    return (
      <div className="flex items-center justify-between rounded-md border border-emerald-600/40 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium text-emerald-600">
          <Trophy className="size-4" />
          Top 7 is open — judges can rank the finalists now.
        </div>
        <Button variant="outline" size="sm" onClick={reopen} disabled={busy}>
          Reopen scoring
        </Button>
      </div>
    );
  }

  // Collapsed to a single slim row for the common in-progress case — this
  // sits at the top of the page and was previously a full card (header +
  // status line + full-width button) every single time, even though it
  // needs the admin's attention only rarely (when actually ready to
  // finalize). Expands to the missing-scores list only on request.
  return (
    <div className="rounded-md border px-3 py-2 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm min-w-0">
          <Trophy className="size-4 text-primary shrink-0" />
          {status.isReady ? (
            <span className="text-emerald-600 font-medium truncate">
              All {status.totalCandidates} candidates fully scored.
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-amber-600 font-medium truncate">
              <AlertTriangle className="size-4 shrink-0" />
              {status.missing.length} combo
              {status.missing.length === 1 ? "" : "s"} still need scoring
            </span>
          )}
          {!status.isReady && status.missing.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground shrink-0"
            >
              {expanded ? "hide" : "details"}
            </button>
          )}
        </div>
        <Button
          onClick={finalize}
          disabled={busy || !status.isReady}
          size="sm"
          className="shrink-0"
        >
          <Trophy className="size-4" />
          Finalize Top 7
        </Button>
      </div>

      {expanded && !status.isReady && status.missing.length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded-md border p-2 space-y-1">
          {status.missing.map((m, i) => (
            <div
              key={i}
              className="text-xs text-muted-foreground flex justify-between"
            >
              <span>
                {m.candidateName} — {m.categoryName} ({m.roundName})
              </span>
              <span>
                {m.judgesSubmitted}/{m.totalJudges}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The People's Choice winner is decided by public voting on the *public
 * site* (a completely separate app/database — free + paid votes,
 * https://miss-baguio's own admin/votes page shows the live leaderboard).
 * Nothing connects that database to this one automatically. This card is
 * the deliberate manual bridge: an admin checks the public vote leaderboard
 * elsewhere, then picks that same candidate here so the flag actually lands
 * on Candidate.IsPeoplesChoice before Top 7 is finalized — see
 * GetTop7WithPeoplesChoiceAsync, which reads exactly that flag. Previously
 * the only way to set it was a raw PUT to /api/candidates/{id}/peoples-choice
 * with no UI at all.
 */
type PeoplesChoiceLeaderboardEntry = {
  candidateId: number;
  candidateName: string;
  barangay?: string | null;
  freeVotes: number;
  paidVotes: number;
  totalVotes: number;
};

function PeoplesChoiceCard({
  token,
  candidates,
}: {
  token: string | null | undefined;
  candidates: Candidate[];
}) {
  const [current, setCurrent] = useState<Candidate | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Live vote leaderboard from the public site's voting database — read-only,
  // purely a hint. Absent/unreachable (e.g. VotesConnection not configured
  // in this environment) just means the hint doesn't show; the manual
  // Set/Change picker above still works exactly as before either way.
  const [liveLeader, setLiveLeader] =
    useState<PeoplesChoiceLeaderboardEntry | null>(null);
  const [liveLeaderUnavailable, setLiveLeaderUnavailable] = useState(false);
  const [liveLeaderUpdatedAt, setLiveLeaderUpdatedAt] = useState<Date | null>(
    null
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = (await get(
        "/api/candidates",
        token ?? undefined
      )) as Candidate[];
      setCurrent(res?.find((c) => c.isPeoplesChoice) ?? null);
    } catch (err) {
      console.error("Failed to load People's Choice status", err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  // Polled rather than fetched once — votes can come in bursts ("dumps")
  // right up to the cutoff, so a stale number from whenever the admin
  // happened to load this page isn't good enough. 30s balances feeling
  // live against not hammering the votes DB with constant queries.
  const loadLiveLeader = useCallback(async () => {
    try {
      const res = (await get(
        "/api/admin/peoples-choice/live-leaderboard",
        token ?? undefined
      )) as PeoplesChoiceLeaderboardEntry[];
      setLiveLeader(res && res.length > 0 ? res[0] : null);
      setLiveLeaderUnavailable(false);
      setLiveLeaderUpdatedAt(new Date());
    } catch {
      // 503 (not configured) or 502 (votes DB unreachable) — either way,
      // just hide the hint. Never surface this as an error to the admin;
      // the manual flow this card already offers is unaffected.
      setLiveLeader(null);
      setLiveLeaderUnavailable(true);
    }
  }, [token]);

  useEffect(() => {
    void loadLiveLeader();
    const interval = setInterval(() => void loadLiveLeader(), 30_000);
    return () => clearInterval(interval);
  }, [loadLiveLeader]);

  async function setPeoplesChoice(candidateId: number) {
    setBusy(true);
    try {
      const candidate = candidates.find((c) => c.id === candidateId);
      await put(
        `/api/candidates/${candidateId}/peoples-choice`,
        true,
        token ?? undefined
      );
      toast.success(
        `${candidate?.name ?? `#${candidateId}`} set as People's Choice.`
      );
      setPickerOpen(false);
      await load();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to set People's Choice"
      );
    } finally {
      setBusy(false);
    }
  }

  async function clearPeoplesChoice() {
    if (!current) return;
    setBusy(true);
    try {
      await put(
        `/api/candidates/${current.id}/peoples-choice`,
        false,
        token ?? undefined
      );
      toast.success("People's Choice cleared.");
      await load();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to clear People's Choice"
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground px-1">
        Checking People's Choice…
      </div>
    );
  }

  return (
    <div className="rounded-md border px-3 py-2 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm min-w-0">
          <Star className="size-4 text-primary shrink-0" />
          {current ? (
            <span className="truncate">
              <span className="font-medium">People's Choice:</span>{" "}
              {current.name}
              {current.barangay ? ` (${current.barangay})` : ""}
            </span>
          ) : liveLeaderUnavailable ? (
            <span className="text-muted-foreground truncate">
              People's Choice not set yet — check the public site's vote
              leaderboard, then pick the winner here.
            </span>
          ) : (
            <span className="text-muted-foreground truncate">
              People's Choice not set yet.
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {current && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearPeoplesChoice}
              disabled={busy}
            >
              Clear
            </Button>
          )}
          <Button
            variant={current ? "outline" : "default"}
            size="sm"
            onClick={() => {
              setSelectedId(current?.id ?? null);
              setPickerOpen((v) => !v);
            }}
            disabled={busy}
          >
            <Star className="size-3.5" />
            {current ? "Change" : "Set"}
          </Button>
        </div>
      </div>

      {/* Live vote leaderboard hint — read-only, doesn't set anything by
          itself. Shown only when it's actually informative: the votes DB
          is reachable AND the leader isn't already the flagged candidate.
          Auto-refreshes every 30s (see loadLiveLeader's useEffect) since
          votes can come in bursts right up to the cutoff — a number from
          whenever the admin happened to load this page isn't good enough. */}
      {liveLeader && liveLeader.candidateId !== current?.id && (
        <div className="flex items-center justify-between gap-3 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs">
          <span className="text-muted-foreground truncate">
            Live vote leader:{" "}
            <span className="font-medium text-foreground">
              {liveLeader.candidateName}
            </span>
            {liveLeader.barangay ? ` (${liveLeader.barangay})` : ""} —{" "}
            {liveLeader.totalVotes.toLocaleString()} votes (
            {liveLeader.freeVotes.toLocaleString()} free +{" "}
            {liveLeader.paidVotes.toLocaleString()} paid)
            {liveLeaderUpdatedAt && (
              <>
                {" · "}
                <LiveAgo since={liveLeaderUpdatedAt} />
              </>
            )}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-xs"
              disabled={busy}
              onClick={() => void loadLiveLeader()}
              title="Refresh now"
            >
              <RefreshCw className="size-3" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              disabled={busy}
              onClick={() => {
                setSelectedId(liveLeader.candidateId);
                setPickerOpen(true);
              }}
            >
              Use this
            </Button>
          </div>
        </div>
      )}

      {pickerOpen && (
        <div className="flex items-center gap-2">
          <Select
            value={selectedId != null ? String(selectedId) : undefined}
            onValueChange={(v) => setSelectedId(Number(v))}
          >
            <SelectTrigger className="bg-muted border-border flex-1">
              <SelectValue placeholder="Pick the vote winner…" />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  #{c.id} — {c.name}
                  {c.barangay ? ` (${c.barangay})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={busy || selectedId == null}
            onClick={() => selectedId != null && setPeoplesChoice(selectedId)}
          >
            Confirm
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * "updated Ns ago" that keeps itself current — re-renders every 5s so the
 * freshness readout on the live vote leaderboard doesn't just freeze at
 * whatever it said the moment it first appeared (the 30s poll interval
 * updates the data; this ticks the *label* between polls).
 */
function LiveAgo({ since }: { since: Date }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 5_000);
    return () => clearInterval(interval);
  }, []);

  const seconds = Math.max(0, Math.round((Date.now() - since.getTime()) / 1000));
  const label =
    seconds < 5
      ? "updated just now"
      : seconds < 60
      ? `updated ${seconds}s ago`
      : `updated ${Math.floor(seconds / 60)}m ago`;

  return <span>{label}</span>;
}
