import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { get } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ROUNDS, CATEGORIES } from "@/lib/rounds";

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
import { toast } from "sonner";
import { useNavigate, useParams } from "react-router-dom";
import type { Candidate } from "@/types/candidate";
import type { ScoringSessionDto } from "@/types/scoring";
import { useScoring } from "@/hooks/useScoring";
import { ChevronLeft } from "lucide-react";
import { LoadingView, EmptyView, ErrorView } from "@/components/ui/status-view";

const CORONATION_ROUND_ID = 2;

/**
 * Renders the "-300x375" resized variant first (cheaper to load), but
 * falls back to the full-size photoUrl on error. The 2026 roster's S3
 * photos were never uploaded with that resized suffix (confirmed: every
 * "-300x375" URL 403s), so without this fallback the judge screen showed
 * no photo for any candidate at all. Falls back again to initials if even
 * the full-size photo fails.
 */
function CandidatePhoto({
  photoUrl,
  name,
}: {
  photoUrl: string;
  name: string;
}) {
  const small = deriveSizedUrl(photoUrl, "-300x375");
  const [src, setSrc] = useState(small || photoUrl);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSrc(deriveSizedUrl(photoUrl, "-300x375") || photoUrl);
    setFailed(false);
  }, [photoUrl]);

  if (failed) {
    return (
      <div className="w-full h-full flex items-center justify-center text-6xl font-bold text-[var(--muted-foreground)]">
        {(name || "U").slice(0, 2).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      width={300}
      height={375}
      decoding="async"
      className="w-full h-full object-cover"
      onError={() => {
        if (src !== photoUrl) {
          // resized variant 404/403'd — fall back to the full-size original
          setSrc(photoUrl);
        } else {
          // full-size also failed — give up and show initials
          setFailed(true);
        }
      }}
    />
  );
}
const MORNING_ROUND_ID = 1;

/**
 * Live judge scoring screen — shared by BOTH the Sep 5 morning session
 * (Q&A, Creative Costume) and Coronation Night (Swimwear, Evening Wear).
 * The API's session/scoring endpoints are round-agnostic; this component
 * just needs a roundId to know which active session to poll.
 *
 * Reached via /finals-scoring (roundId defaults to Coronation Night, for
 * back-compat with the existing route/bookmarks) or /scoring/:roundId
 * (explicit — used by the morning-session card on JudgeHome).
 */
export default function FinalsScoring() {
  const { roundId: roundIdParam } = useParams<{ roundId?: string }>();
  const roundId = roundIdParam ? Number(roundIdParam) : CORONATION_ROUND_ID;
  const roundInvalid = roundIdParam !== undefined && Number.isNaN(roundId);

  const token = useAuthStore((s) => s.token);
  const [value, setValue] = useState(7.0);
  const [submitted, setSubmitted] = useState(false);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const {
    session,
    isLocked,
    loading: sessionLoading,
    submitScore,
  } = useScoring({ roundId });

  // derive candidate from session if available; otherwise optionally fetch
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        if (!session) {
          setCandidate(null);
          return;
        }

        if (session.candidate) {
          setCandidate(session.candidate);
          return;
        }

        const active = (await get(
          `/api/scoring/session/active/${roundId}`,
          token ?? undefined
        )) as ScoringSessionDto | null | undefined;
        if (!mounted) return;
        setCandidate(active?.candidate ?? null);
      } catch {
        setCandidate(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [session, token, roundId]);

  // Correction flow — deliberately tucked away and gated so it can't be
  // used as a casual "keep nudging until I like it" second attempt. Morning
  // round only: Coronation Night scores are flashed on the live audience
  // display per the judging guidelines, so a visibly changing number there
  // would look like scores are being altered under pressure. See the API's
  // SubmitScore for the matching server-side gate (this UI restriction is
  // just for a clean flow — the server is what actually enforces it).
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [hasCorrected, setHasCorrected] = useState(false);
  const canCorrect = roundId === MORNING_ROUND_ID && !hasCorrected;

  async function submit(isCorrection = false) {
    if (!session || !candidate) return;
    setSubmitted(true);
    try {
      await submitScore(Number(value), isCorrection);
      qc.invalidateQueries({ queryKey: ["scores", candidate.id] });
      if (isCorrection) setHasCorrected(true);
      setIsCorrecting(false);
      // show success toast
      toast.success(
        `${isCorrection ? "Corrected to" : "Submitted"} ${value.toFixed(
          1
        )} for ${candidate.name}`
      );
    } catch (e) {
      // A failed correction leaves the original submitted score standing —
      // it was already true before this attempt (correcting is only ever
      // offered once a score exists), so a failed *new* submission clears
      // it and a failed *correction* leaves it alone.
      setSubmitted(isCorrection ? true : false);
      console.error(e);
      throw e;
    }
  }

  // confirm dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // reset slider and submission state when candidate changes.
  // Keyed on session?.id (the session's own GUID) rather than the whole
  // `session` object — useScoring's fetchActive() returns a brand-new object
  // on every SignalR reconnect/refetch even when nothing actually changed
  // (common on tablet wifi at a live event), which was re-running this
  // effect and silently flipping hasCorrected back to false, letting a judge
  // who'd already used her one correction see "Made a mistake?" reappear.
  useEffect(() => {
    if (session) {
      setValue(session.myScore ?? 7.0);
      setSubmitted(session.hasSubmitted);
    } else {
      setValue(7.0);
      setSubmitted(false);
    }
    setConfirmOpen(false);
    setIsSubmitting(false);
    setSubmitError(null);
    setIsCorrecting(false);
    setHasCorrected(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally not depending on the whole `session` object, see comment above.
  }, [candidate?.id, session?.id]);

  return (
    <div className="p-3 max-w-4xl mx-auto">
      <div className="flex mb-4">
        <Button variant="ghost" onClick={() => navigate("/judge/home")}>
          <ChevronLeft className="size-4" />
          Back to Home
        </Button>
      </div>

      {roundInvalid ? (
        <ErrorView
          title="Unknown round"
          description="This scoring link doesn't point to a valid round."
        />
      ) : loading || sessionLoading ? (
        <LoadingView label="Loading session…" />
      ) : !session || !candidate ? (
        <EmptyView
          title="Waiting for admin"
          description="No active session yet. This page will update automatically once the admin starts scoring a candidate."
        />
      ) : (
        <>
          <div className="px-4 mb-2 font-bold">
            {ROUNDS.find((r) => r.id === roundId)?.description ?? ""}
            {" — "}
            {session?.category?.description ??
              CATEGORIES.find((c) => c.id === session?.categoryId)
                ?.description ??
              ""}
          </div>

          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row gap-6 items-stretch">
                {/* Left column: photo with preserved 4:5 aspect ratio and name overlay */}
                <div className="md:flex-none flex items-center justify-center">
                  <div className="relative w-full md:w-[375px] max-w-[500px] max-h-[400px] rounded-md overflow-hidden bg-[color:var(--muted-fill)]">
                    {candidate.photoUrl ? (
                      <CandidatePhoto
                        photoUrl={candidate.photoUrl}
                        name={candidate.name}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-6xl font-bold text-[var(--muted-foreground)]">
                        {(candidate.name || "U").slice(0, 2).toUpperCase()}
                      </div>
                    )}

                    <div className="absolute left-4 bottom-4 bg-black/50 text-white px-3 py-1 rounded-md">
                      <div className="font-semibold text-lg">
                        {candidate.name}
                      </div>
                      <div className="text-sm">
                        Candidate #{candidate.number ?? candidate.id}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right column: score centered, slider + submit at bottom */}
                <div className="md:flex-1 flex flex-col justify-between py-8">
                  <div className="px-4 flex flex-row-reverse items-center gap-3">
                    <Button
                      onClick={() => setConfirmOpen(true)}
                      disabled={(submitted && !isCorrecting) || isLocked}
                    >
                      {isLocked
                        ? "Locked"
                        : isCorrecting
                        ? "Submit Correction"
                        : submitted
                        ? "Submitted"
                        : "Submit Score"}
                    </Button>
                    {submitted && !isCorrecting && !isLocked && canCorrect && (
                      <button
                        type="button"
                        onClick={() => setIsCorrecting(true)}
                        className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                      >
                        Made a mistake?
                      </button>
                    )}
                    {isCorrecting && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsCorrecting(false);
                          setValue(session?.myScore ?? value);
                        }}
                        className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                      >
                        Cancel correction
                      </button>
                    )}
                  </div>
                  <div className="flex-1 flex items-center justify-center">
                    <div
                      className={`text-8xl md:text-[6rem] font-extrabold ${
                        value !== 7.0 ? "text-yellow-500" : ""
                      }`}
                    >
                      {value.toFixed(1)}
                    </div>
                  </div>
                  <div className="w-full px-4 py-3">
                    {/* This runs on judges' tablets, not mice — the thumb
                        IS the full tappable/draggable hit area (Radix has
                        no separate touch-target padding), so it needs to
                        be close to Apple/Android's ~44px touch-target
                        guideline, not a mouse-cursor-sized 24px dot. */}
                    <Slider
                      value={[value]}
                      min={7}
                      max={10}
                      step={0.1}
                      onValueChange={(v) => {
                        const n = Math.round((v[0] ?? value) * 10) / 10;
                        setValue(n);
                      }}
                      disabled={(submitted && !isCorrecting) || isLocked}
                      trackClassName="h-4"
                      thumbClassName="h-11 w-11"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          {confirmOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="bg-card rounded-lg p-6 w-full max-w-md">
                <div className="text-lg font-semibold mb-2">
                  {isCorrecting ? "Confirm correction" : "Confirm score"}
                </div>
                <div className="mb-4">
                  {isCorrecting ? (
                    <>
                      Are you sure you want to change your score to{" "}
                      <span className="font-bold">{value.toFixed(1)}</span>{" "}
                      for {candidate.name}? This should be a genuine
                      correction — you won't be able to change it again after
                      this.
                    </>
                  ) : (
                    <>
                      Are you sure you want to submit a score of{" "}
                      <span className="font-bold">{value.toFixed(1)}</span>{" "}
                      for {candidate.name}?
                    </>
                  )}
                </div>
                {submitError && (
                  <div className="text-sm text-destructive mb-3">
                    {submitError}
                  </div>
                )}
                <div className="flex gap-3 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => setConfirmOpen(false)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={async () => {
                      setSubmitError(null);
                      setIsSubmitting(true);
                      try {
                        await submit(isCorrecting);
                        setIsSubmitting(false);
                        setConfirmOpen(false);
                      } catch (err) {
                        console.error(err);
                        const msg =
                          err instanceof Error ? err.message : String(err);
                        setSubmitError(msg || "Submission failed");
                        setIsSubmitting(false);
                      }
                    }}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <span className="inline-flex items-center">
                        <svg
                          className="animate-spin h-4 w-4 mr-2"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="none"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                          ></path>
                        </svg>
                        Submitting...
                      </span>
                    ) : (
                      "Confirm"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
