import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { get } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ROUNDS, CATEGORIES } from "@/lib/rounds";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import type { Candidate } from "@/types/candidate";
import type { ScoringSessionDto } from "@/types/scoring";
import { useScoring } from "@/hooks/useScoring";
import { ChevronLeft } from "lucide-react";

export default function FinalsScoring() {
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
  } = useScoring({ roundId: 2 });

  const ROUND_ID = 2;

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
          `/api/scoring/session/active/${2}`,
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
  }, [session, token]);

  async function submit() {
    if (!session || !candidate) return;
    setSubmitted(true);
    try {
      await submitScore(Number(value));
      qc.invalidateQueries({ queryKey: ["scores", candidate.id] });
      // show success toast
      toast.success(`Submitted ${value.toFixed(1)} for ${candidate.name}`);
    } catch (e) {
      setSubmitted(false);
      console.error(e);
    }
  }

  // confirm dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // reset slider and submission state when candidate changes
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
  }, [candidate?.id, session]);

  if (loading || sessionLoading) return <div className="p-8">Loading…</div>;

  if (!session || !candidate)
    return <div className="p-8">Waiting for admin to start a session.</div>;

  return (
    <div className="p-8">
      <div className="flex mb-4">
        <Button variant="ghost" onClick={() => navigate("/judge/home")}>
          <ChevronLeft className="size-4" />
          Back to Home
        </Button>
      </div>

      <div className="px-4 mb-2 font-bold">
        {ROUNDS.find((r) => r.id === ROUND_ID)?.name ?? ""}
        {" — "}
        {session?.category?.description ??
          CATEGORIES.find((c) => c.id === session?.categoryId)?.name ??
          ""}
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
            {/* Left column: photo with preserved 4:5 aspect ratio and name overlay */}
            <div className="flex items-center justify-center">
              <div
                className="relative w-full max-w-[720px] rounded-md overflow-hidden bg-[color:var(--muted-fill)]"
                style={{ aspectRatio: "4 / 5" }}
              >
                {candidate.photoUrl ? (
                  <img
                    src={candidate.photoUrl}
                    alt={candidate.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-6xl font-bold text-[var(--muted-foreground)]">
                    {(candidate.name || "U").slice(0, 2).toUpperCase()}
                  </div>
                )}

                <div className="absolute left-4 bottom-4 bg-black/50 text-white px-3 py-1 rounded-md">
                  <div className="font-semibold text-lg">{candidate.name}</div>
                  <div className="text-sm">
                    Candidate #{candidate.number ?? candidate.id}
                  </div>
                </div>
              </div>
            </div>

            {/* Right column: score centered, slider + submit at bottom */}
            <div className="flex flex-col justify-between">
              <div className="flex-1 flex items-center justify-center">
                <div className="text-8xl md:text-[6rem] font-extrabold">
                  {value.toFixed(1)}
                </div>
              </div>

              <div className="mt-6">
                <div className="w-full px-4 -mt-4">
                  <Slider
                    value={[value]}
                    min={7}
                    max={10}
                    step={0.1}
                    onValueChange={(v) => {
                      const n = Math.round((v[0] ?? value) * 10) / 10;
                      setValue(n);
                    }}
                    disabled={submitted || isLocked}
                    trackClassName="h-3"
                    thumbClassName="h-6 w-6"
                  />
                </div>

                <div className="mt-14 px-4">
                  <Button
                    onClick={() => setConfirmOpen(true)}
                    disabled={submitted || isLocked}
                    className="w-full"
                  >
                    {isLocked
                      ? "Locked"
                      : submitted
                      ? "Submitted"
                      : "Submit Score"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-lg p-6 w-full max-w-md">
            <div className="text-lg font-semibold mb-2">Confirm score</div>
            <div className="mb-4">
              Are you sure you want to submit a score of{" "}
              <span className="font-bold">{value.toFixed(1)}</span> for{" "}
              {candidate.name}?
            </div>
            {submitError && (
              <div className="text-sm text-destructive mb-3">{submitError}</div>
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
                    await submit();
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
    </div>
  );
}
