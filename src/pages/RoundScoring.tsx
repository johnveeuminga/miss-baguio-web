import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { LoadingView, ErrorView } from "@/components/ui/status-view";
import { ROUNDS } from "@/lib/rounds";
import { useRoundScoring, extractErrorMessage } from "@/hooks/useRoundScoring";
import { useScoringControl } from "@/hooks/useScoringControl";
import { useScoringHubConnection } from "@/hooks/useScoringHubConnection";
import { get } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { ChevronLeft, ChevronRight, CheckCircle2, Lock, AlertTriangle, Minus, Plus, Radio } from "lucide-react";
import { toast } from "sonner";
import type { RoundCategoryDto, ScoringSessionDto, MyRoundCandidateScoresDto } from "@/types/scoring";

// Rounds a raw value to the category's step (avoids float drift like
// 8.099999999999998) and clamps it inside [min, max] — shared by the
// slider drag and the +/- stepper buttons so both always land on a valid
// score.
function clampToStep(rawValue: number, category: RoundCategoryDto): number {
  const stepped =
    Math.round(rawValue / category.scoreIncrement) * category.scoreIncrement;
  const rounded = Math.round(stepped * 100) / 100;
  return Math.min(category.maxScore, Math.max(category.minScore, rounded));
}

// derive a sized url by inserting a suffix before the file extension
function deriveSizedUrl(url: string | undefined | null, suffix: string) {
  if (!url) return null;
  try {
    const [base, query] = url.split("?");
    const idx = base.lastIndexOf(".");
    if (idx === -1) return url;
    return `${base.slice(0, idx)}${suffix}${base.slice(idx)}${
      query ? "?" + query : ""
    }`;
  } catch {
    return url;
  }
}

function CandidatePhoto({ photoUrl, name }: { photoUrl?: string | null; name: string }) {
  const small = deriveSizedUrl(photoUrl, "-300x375");
  const [src, setSrc] = useState(small || photoUrl || "");
  const [failed, setFailed] = useState(!photoUrl);

  useEffect(() => {
    setSrc(deriveSizedUrl(photoUrl, "-300x375") || photoUrl || "");
    setFailed(!photoUrl);
  }, [photoUrl]);

  if (failed) {
    return (
      <div className="w-full h-full flex items-center justify-center text-lg font-bold text-muted-foreground bg-muted">
        {(name || "U").slice(0, 2).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      width={56}
      height={70}
      decoding="async"
      className="w-full h-full object-cover"
      onError={() => {
        if (src !== photoUrl && photoUrl) {
          setSrc(photoUrl);
        } else {
          setFailed(true);
        }
      }}
    />
  );
}

/**
 * The actual score-entry controls (big number readout + steppers + slider)
 * — shared by both the featured on-stage card (always expanded) and the
 * compact rows below (expand-on-tap), so the two layouts can't drift out
 * of sync with each other.
 */
function ScoreEntry({
  value,
  category,
  isSaving,
  disabled,
  onChange,
}: {
  value: number | null;
  category: RoundCategoryDto;
  isSaving: boolean;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-center mb-3">
        <div
          className={`text-6xl font-extrabold ${
            isSaving ? "text-muted-foreground" : "text-primary"
          }`}
        >
          {(value ?? category.minScore).toFixed(1)}
        </div>
      </div>
      {/* +/- steppers flank the slider — a precise 0.1 drag on a
          touchscreen is fiddly to land exactly, and a judge does this up
          to 32 times per round (16 candidates x up to 2 categories).
          Tapping is more reliable than dragging for a single-increment
          nudge. */}
      <div className="flex items-center gap-2 px-1">
        <Button
          type="button"
          variant="outline"
          className="h-11 w-11 shrink-0 p-0"
          disabled={disabled || (value ?? category.minScore) <= category.minScore}
          onClick={() =>
            onChange(
              clampToStep((value ?? category.minScore) - category.scoreIncrement, category)
            )
          }
        >
          <Minus className="size-5" />
        </Button>
        <div className="flex-1">
          <Slider
            value={[value ?? category.minScore]}
            min={category.minScore}
            max={category.maxScore}
            step={category.scoreIncrement}
            onValueChange={(v) => onChange(clampToStep(v[0] ?? category.minScore, category))}
            disabled={disabled}
            trackClassName="h-4"
            thumbClassName="h-11 w-11"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-11 w-11 shrink-0 p-0"
          disabled={disabled || (value ?? category.minScore) >= category.maxScore}
          onClick={() =>
            onChange(
              clampToStep((value ?? category.minScore) + category.scoreIncrement, category)
            )
          }
        >
          <Plus className="size-5" />
        </Button>
      </div>
    </div>
  );
}

// Back-compat: /finals-scoring (no :roundId param) has historically meant
// "Coronation Night" — bookmarks/muscle memory from the old FinalsScoring
// screen. /scoring/:roundId is the explicit, preferred route.
const CORONATION_ROUND_ID = 2;

/**
 * 2026 free-form round scoring. Per the Executive Committee: within a
 * round, a judge sees ALL candidates immediately and can score/re-score
 * ANY of them, in any category of this round, in any order, as many times
 * as they like — e.g. seeing candidate 2 answer better and going back to
 * adjust candidate 1's score — right up until they hit one Submit for the
 * whole round. This replaces the old one-candidate-at-a-time live-session
 * screen (see git history for FinalsScoring.tsx / useScoring.tsx, which
 * are kept only for JudgeHome's "who's currently on stage" display).
 */
export default function RoundScoring() {
  const { roundId: roundIdParam } = useParams<{ roundId?: string }>();
  const roundId = roundIdParam ? Number(roundIdParam) : CORONATION_ROUND_ID;
  const roundInvalid = roundIdParam !== undefined && Number.isNaN(roundId);
  const navigate = useNavigate();

  const {
    data,
    loading,
    error,
    reload,
    debouncedSaveScore,
    savingKeys,
    submitCategory,
    requestCategoryCorrection,
    categoryProgress,
    categorySubmission,
  } = useRoundScoring(roundInvalid ? -1 : roundId);
  const { control: scoringControl, loading: scoringControlLoading } = useScoringControl();
  const token = useAuthStore((s) => s.token);

  // Who admin currently has "on stage" for this round — purely a visual
  // cue (a star next to that candidate's row) so it's still noticeable
  // even though judges can freely score anyone. Live-updates via the same
  // ActiveCandidateChanged broadcast JudgeHome already listens for.
  const [activeSession, setActiveSession] = useState<ScoringSessionDto | null>(null);
  const loadActiveSession = useCallback(async () => {
    if (roundInvalid) return;
    try {
      const res = (await get(
        `/api/scoring/session/active/${roundId}`,
        token ?? undefined
      )) as ScoringSessionDto;
      setActiveSession(res);
    } catch {
      // 404 = no active session right now — that's a normal state, not an error.
      setActiveSession(null);
    }
  }, [roundId, roundInvalid, token]);

  useEffect(() => {
    void loadActiveSession();
  }, [loadActiveSession]);

  const hubConnection = useScoringHubConnection(token);
  useEffect(() => {
    if (!hubConnection) return;
    const onChanged = () => void loadActiveSession();
    hubConnection.on("ActiveCandidateChanged", onChanged);
    hubConnection.onreconnected(onChanged);
    return () => {
      hubConnection.off("ActiveCandidateChanged", onChanged);
    };
  }, [hubConnection, loadActiveSession]);

  // No roundId field on ScoringSessionDto — the round is already scoped by
  // the fetch's URL path (/session/active/{roundId}), so whatever comes
  // back is already for this round.
  const activeCandidateId = activeSession?.candidateId ?? null;

  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [expandedCandidateId, setExpandedCandidateId] = useState<number | null>(null);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [confirmCorrectionOpen, setConfirmCorrectionOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // The one category admin currently has open for scoring (per the
  // Executive Committee: avoid mis-scoring the wrong category from a
  // mistap on the tabs) — only meaningful while it's this round's control.
  const activeCategoryId =
    scoringControl?.isScoringOpen && scoringControl.activeRoundId === roundId
      ? scoringControl.activeCategoryId
      : null;

  // Default to the admin's active category if one's set for this round,
  // otherwise fall back to the first category once data loads.
  useEffect(() => {
    if (!data || categoryId != null) return;
    if (activeCategoryId != null) {
      setCategoryId(activeCategoryId);
    } else if (data.categories.length > 0) {
      setCategoryId(data.categories[0].id);
    }
  }, [data, categoryId, activeCategoryId]);

  // If admin switches the active category while a judge already has the
  // OTHER one open, jump them to the new one automatically rather than
  // leaving them stuck looking at a tab they can no longer submit to.
  useEffect(() => {
    if (activeCategoryId != null && categoryId != null && categoryId !== activeCategoryId) {
      setCategoryId(activeCategoryId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to activeCategoryId changing, not every categoryId change (that would fight the tab click below)
  }, [activeCategoryId]);

  const roundLabel =
    ROUNDS.find((r) => r.id === roundId)?.description ?? data?.roundName ?? "Round";
  const selectedCategory = data?.categories.find((c) => c.id === categoryId) ?? null;

  // Submission is now per-category (a judge can submit Q&A without Costume
  // Wear needing to be scoreable/complete too) — every one of these is
  // scoped to whichever category tab is currently selected, not the round
  // as a whole.
  const selectedCategorySubmission = categoryId != null ? categorySubmission(categoryId) : null;
  const locked = selectedCategorySubmission?.isSubmitted ?? false;
  const selectedCategoryProgress = categoryId != null
    ? categoryProgress(categoryId)
    : { filled: 0, expected: 0, isComplete: false };
  // Scoring is possible only while THIS category isn't submitted AND admin
  // has this exact category open — matches the server-side gate in
  // ScoringController.SubmitScore, so a disabled control here means the
  // API would reject it too, not just a client-side nicety.
  const scoringBlocked = activeCategoryId == null || categoryId !== activeCategoryId;

  function handleScoreChange(candidateId: number, value: number) {
    if (!categoryId || locked || scoringBlocked) return;
    // Debounced: the visible number updates immediately (inside
    // debouncedSaveScore), but the actual POST is coalesced to fire once
    // ~300ms after the judge stops dragging, instead of once per drag
    // frame — see useRoundScoring's debouncedSaveScore doc comment for why.
    debouncedSaveScore(candidateId, categoryId, value, (err) => {
      toast.error(extractErrorMessage(err, "Failed to save score"));
      void reload();
    });
  }

  async function handleSubmit() {
    if (!categoryId) return;
    setSubmitting(true);
    try {
      await submitCategory(categoryId);
      toast.success(`${selectedCategory?.description ?? "Category"} submitted. Scores are now locked.`);
      setConfirmSubmitOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Failed to submit category"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRequestCorrection() {
    if (!categoryId) return;
    setSubmitting(true);
    try {
      await requestCategoryCorrection(categoryId);
      toast.success(`${selectedCategory?.description ?? "Category"} reopened. Make your fix, then submit again.`);
      setConfirmCorrectionOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Failed to reopen category"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-3 max-w-3xl mx-auto pb-28">
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" onClick={() => navigate("/judge/home")}>
          <ChevronLeft className="size-4" />
          Back to Home
        </Button>
        {data && categoryId != null && (
          <span className="text-xs text-muted-foreground shrink-0">
            {selectedCategoryProgress.filled}/{selectedCategoryProgress.expected} scored
            {selectedCategory ? ` — ${selectedCategory.description}` : ""}
          </span>
        )}
      </div>

      {roundInvalid ? (
        <ErrorView
          title="Unknown round"
          description="This scoring link doesn't point to a valid round."
        />
      ) : loading || scoringControlLoading ? (
        // Both fetches gate the initial render together — otherwise the
        // my-scores data can resolve before the scoring-control fetch
        // does, and the screen would briefly flash "closed"/all-tabs-
        // locked (activeCategoryId defaults to null until the control
        // state arrives) before flipping to the real state a moment later.
        <LoadingView label="Loading scoresheet…" />
      ) : error ? (
        <ErrorView title="Couldn't load scoresheet" description={error} onRetry={reload} />
      ) : !data ? null : (
        <>
          <div className="mb-4">
            <h1 className="text-xl font-bold">{roundLabel}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Score any candidate, in any order. Nothing is final until you
              submit the whole round.
            </p>
          </div>

          {locked && (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-emerald-600/40 bg-emerald-600/5 px-3 py-2 text-sm">
              <Lock className="size-4 shrink-0 mt-0.5 text-emerald-600" />
              <span>
                <strong>This round is submitted and locked.</strong>{" "}
                {!data.canRequestCorrection
                  ? "Coronation Night scores are final once submitted — this can't be reopened."
                  : data.hasUsedCorrection
                  ? "You've already used your one correction — this can't be reopened again."
                  : "Made a mistake? You have one correction available."}
              </span>
            </div>
          )}

          {/* Category switcher — one category's full candidate list at a
              time (not a spreadsheet grid) so this stays usable on a
              tablet: fewer, bigger tap targets instead of a dense table.
              Per the Executive Committee: only the admin's active category
              is tappable while scoring is locked to one, so a mistap can't
              land a score in the wrong category. */}
          {data.categories.length > 1 && (
            <>
              <div className="flex gap-1.5 mb-1.5">
                {data.categories.map((c) => {
                  const isLockedOut =
                    activeCategoryId != null && c.id !== activeCategoryId;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={isLockedOut}
                      onClick={() => !isLockedOut && setCategoryId(c.id)}
                      className={
                        "flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors " +
                        (categoryId === c.id
                          ? "bg-primary text-primary-foreground"
                          : isLockedOut
                          ? "bg-muted/40 text-muted-foreground/50 cursor-not-allowed"
                          : "bg-muted text-muted-foreground hover:text-foreground")
                      }
                    >
                      {c.description}
                      {isLockedOut && <Lock className="size-3 inline-block ml-1.5 -mt-0.5" />}
                    </button>
                  );
                })}
              </div>
              {activeCategoryId == null && (
                <p className="text-xs text-muted-foreground mb-3">
                  Waiting for the admin to open a category for scoring.
                </p>
              )}
            </>
          )}

          {(() => {
            const featured = activeCandidateId
              ? data.candidates.find((c) => c.candidateId === activeCandidateId) ?? null
              : null;
            const rest = featured
              ? data.candidates.filter((c) => c.candidateId !== featured.candidateId)
              : data.candidates;
            // Split the remaining 15 into two columns — first column gets
            // the extra one when the count is odd (8/7), so the columns
            // read top-to-bottom in candidate order rather than
            // alternating left/right.
            const mid = Math.ceil(rest.length / 2);
            const columnA = rest.slice(0, mid);
            const columnB = rest.slice(mid);

            function renderCompactRow(candidate: MyRoundCandidateScoresDto) {
              const score = candidate.scores.find((s) => s.categoryId === categoryId);
              const value = score?.scoreValue ?? null;
              const expanded = expandedCandidateId === candidate.candidateId;
              const key = `${candidate.candidateId}-${categoryId}`;
              const isSaving = savingKeys.has(key);

              return (
                <Card key={candidate.candidateId}>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedCandidateId((cur) =>
                        cur === candidate.candidateId ? null : candidate.candidateId
                      )
                    }
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 text-left"
                  >
                    <div className="size-11 rounded-md overflow-hidden shrink-0 bg-muted">
                      <CandidatePhoto photoUrl={candidate.photoUrl} name={candidate.candidateName} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{candidate.candidateName}</div>
                      {candidate.barangay && (
                        <div className="text-[11px] text-muted-foreground truncate">
                          {candidate.barangay}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {value != null ? (
                        <span className="text-sm font-bold text-primary">{value.toFixed(1)}</span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                      <ChevronRight
                        className={`size-3.5 text-muted-foreground transition-transform ${
                          expanded ? "rotate-90" : ""
                        }`}
                      />
                    </div>
                  </button>

                  {expanded && selectedCategory && (
                    <CardContent className="pt-0 pb-4">
                      <ScoreEntry
                        value={value}
                        category={selectedCategory}
                        isSaving={isSaving}
                        disabled={locked || scoringBlocked}
                        onChange={(v) => void handleScoreChange(candidate.candidateId, v)}
                      />
                    </CardContent>
                  )}
                </Card>
              );
            }

            return (
              <>
                {/* Featured on-stage candidate — admin-controlled, pulled
                    out of the list and shown big + already expanded at the
                    top so the judge doesn't have to scroll to find whoever
                    is currently presenting. Purely a UI convenience: she's
                    not scored any differently than anyone else. */}
                {featured &&
                  (() => {
                    const score = featured.scores.find((s) => s.categoryId === categoryId);
                    const value = score?.scoreValue ?? null;
                    const key = `${featured.candidateId}-${categoryId}`;
                    const isSaving = savingKeys.has(key);
                    return (
                      <Card className="mb-4 border-primary ring-1 ring-primary/40">
                        <CardContent className="pt-4">
                          <div className="flex items-center gap-2 mb-3 text-primary text-xs font-semibold uppercase tracking-wide">
                            <Radio className="size-3.5" />
                            On stage now
                          </div>
                          <div className="flex items-center gap-3 mb-4">
                            <div className="size-20 rounded-md overflow-hidden shrink-0 bg-muted">
                              <CandidatePhoto photoUrl={featured.photoUrl} name={featured.candidateName} />
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-lg truncate">{featured.candidateName}</div>
                              {featured.barangay && (
                                <div className="text-sm text-muted-foreground truncate">
                                  {featured.barangay}
                                </div>
                              )}
                            </div>
                          </div>
                          {selectedCategory && (
                            <ScoreEntry
                              value={value}
                              category={selectedCategory}
                              isSaving={isSaving}
                              disabled={locked || scoringBlocked}
                              onChange={(v) => void handleScoreChange(featured.candidateId, v)}
                            />
                          )}
                        </CardContent>
                      </Card>
                    );
                  })()}

                {/* Everyone else — compact, tap-to-expand, split into two
                    columns (8/7 for 15 remaining) so the full roster is
                    scannable without a long single-column scroll. */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">{columnA.map(renderCompactRow)}</div>
                  <div className="space-y-2">{columnB.map(renderCompactRow)}</div>
                </div>
              </>
            );
          })()}
        </>
      )}

      {/* Fixed submit bar — always reachable without scrolling back up,
          since the candidate list can run to 16 rows. */}
      {data && !roundInvalid && (
        <div className="fixed bottom-0 left-0 right-0 border-t bg-card px-4 py-3 flex items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            {locked ? (
              <span className="flex items-center gap-1.5">
                <Lock className="size-4" /> {selectedCategory?.description ?? "Category"} submitted
              </span>
            ) : selectedCategoryProgress.isComplete ? (
              <span className="flex items-center gap-1.5 text-emerald-600">
                <CheckCircle2 className="size-4" /> All scores entered for {selectedCategory?.description ?? "this category"}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-amber-600">
                <AlertTriangle className="size-4" />
                {selectedCategoryProgress.expected - selectedCategoryProgress.filled} score(s) remaining in {selectedCategory?.description ?? "this category"}
              </span>
            )}
          </div>
          {locked ? (
            selectedCategorySubmission?.canRequestCorrection &&
            !selectedCategorySubmission?.hasUsedCorrection && (
              <Button
                variant="outline"
                onClick={() => setConfirmCorrectionOpen(true)}
              >
                Made a mistake?
              </Button>
            )
          ) : (
            <Button
              onClick={() => setConfirmSubmitOpen(true)}
              disabled={!selectedCategoryProgress.isComplete}
            >
              Submit {selectedCategory?.description ?? "Category"}
            </Button>
          )}
        </div>
      )}

      {confirmSubmitOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="max-w-sm w-full">
            <CardContent className="pt-6 space-y-4">
              <div>
                <h2 className="font-semibold text-lg">
                  Submit {selectedCategory?.description ?? "this category"}?
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  All {selectedCategoryProgress.expected} scores for{" "}
                  {selectedCategory?.description ?? "this category"} will be
                  locked. You'll have one correction available for it
                  afterward if you need to fix a mistake — other categories
                  in this round are unaffected and can still be scored
                  separately.
                </p>
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="ghost"
                  onClick={() => setConfirmSubmitOpen(false)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={submitting}>
                  {submitting ? "Submitting…" : "Submit"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {confirmCorrectionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="max-w-sm w-full">
            <CardContent className="pt-6 space-y-4">
              <div>
                <h2 className="font-semibold text-lg">Reopen for correction?</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  This is your <strong>one</strong> allowed correction for{" "}
                  {selectedCategory?.description ?? "this category"}. Once
                  you submit it again, it can't be reopened a second time.
                </p>
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="ghost"
                  onClick={() => setConfirmCorrectionOpen(false)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button onClick={handleRequestCorrection} disabled={submitting}>
                  {submitting ? "Reopening…" : "Reopen for correction"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
