import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as signalR from "@microsoft/signalr";
import { get, BASE } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorView } from "@/components/ui/status-view";
import { ROUNDS, CATEGORIES } from "@/lib/rounds";
import type { ScoringSessionDto, MyRoundScoresDto } from "@/types/scoring";
import { Lock, Radio, Sparkles, Sunrise, Trophy } from "lucide-react";

// Miss Baguio 2026 "Road to Top 7" — see lib/rounds.ts for the full model.
const MORNING_ROUND_ID = 1;
const CORONATION_ROUND_ID = 2;

type RoundStatus = {
  // ScoringSession is now purely cosmetic — "who's currently on stage" for
  // the live audience/judge display. Whether THIS judge has submitted the
  // round comes from `myScores` (see GetMyRoundScores — strictly scoped to
  // the calling judge's own scores; judges never see other judges' scores
  // or submission state).
  session: ScoringSessionDto | null;
  myScores: MyRoundScoresDto | null;
  loading: boolean;
};

const emptyStatus: RoundStatus = { session: null, myScores: null, loading: true };

/**
 * A judge's landing page after login. Shows what's actually live right now
 * (candidate, category, whether the judge has already submitted) for each
 * of the three stages, so the judge isn't picking between blind buttons
 * every time the admin moves to a new candidate or a new stage.
 */
export default function JudgeHome() {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const [morning, setMorning] = useState<RoundStatus>(emptyStatus);
  const [coronation, setCoronation] = useState<RoundStatus>(emptyStatus);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function fetchSession(roundId: number): Promise<ScoringSessionDto | null> {
    return (await get(
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
  }

  async function fetchMyScores(roundId: number): Promise<MyRoundScoresDto | null> {
    return (await get(
      `/api/scoring/rounds/${roundId}/my-scores`,
      token ?? undefined
    ).catch(() => null)) as MyRoundScoresDto | null;
  }

  async function load() {
    setLoadError(null);
    setMorning((s) => ({ ...s, loading: true }));
    setCoronation((s) => ({ ...s, loading: true }));
    try {
      const [morningSession, coronationSession, morningScores, coronationScores] =
        await Promise.all([
          fetchSession(MORNING_ROUND_ID),
          fetchSession(CORONATION_ROUND_ID),
          fetchMyScores(MORNING_ROUND_ID),
          fetchMyScores(CORONATION_ROUND_ID),
        ]);
      setMorning({ session: morningSession, myScores: morningScores, loading: false });
      setCoronation({ session: coronationSession, myScores: coronationScores, loading: false });
    } catch (err) {
      setMorning({ session: null, myScores: null, loading: false });
      setCoronation({ session: null, myScores: null, loading: false });
      setLoadError(err instanceof Error ? err.message : "Failed to load");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Live-refresh both stage cards whenever the admin starts a new session
  // on either round. This page previously only fetched once on mount — no
  // SignalR listener at all — so a judge sitting on this screen never saw
  // the admin's candidate change until they manually reloaded the page.
  // ActiveCandidateChanged is the same broadcast useScoring already
  // listens for on the live scoring screen; this just wires the same
  // event into the landing page's two status cards.
  useEffect(() => {
    if (!token) return;
    const conn = new signalR.HubConnectionBuilder()
      .withUrl(`${BASE}/scoringHub`, { accessTokenFactory: () => token })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    conn.on("ActiveCandidateChanged", () => void load());
    conn.onreconnected(() => void load());

    void conn.start();

    return () => {
      void conn.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function categoryFor(status: RoundStatus) {
    return (
      status.session?.category?.description ??
      CATEGORIES.find((c) => c.id === status.session?.categoryId)
        ?.description ??
      null
    );
  }

  function progressLabel(status: RoundStatus) {
    if (!status.myScores) return null;
    const total =
      status.myScores.candidates.length * status.myScores.categories.length;
    const filled = status.myScores.candidates.reduce(
      (sum, c) => sum + c.scores.filter((s) => s.scoreValue != null).length,
      0
    );
    return `${filled}/${total} scored`;
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">
          Hello, {user?.fullName ?? "Judge"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Score any candidate, in any order — nothing's final until you
          submit the whole round.
        </p>
      </div>

      {loadError ? (
        <ErrorView
          title="Couldn't load the current session"
          description={loadError}
          onRetry={load}
          className="mb-6"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <StageCard
            icon={Sunrise}
            title={
              ROUNDS.find((r) => r.id === MORNING_ROUND_ID)?.description ??
              "Preliminaries"
            }
            loading={morning.loading}
            active={!!morning.session}
            statusLabel={
              morning.session
                ? categoryFor(morning) ?? "In progress"
                : progressLabel(morning) ?? "Not started"
            }
            candidateName={morning.session?.candidate?.name}
            hasSubmitted={morning.myScores?.isSubmitted}
            isLocked={morning.myScores?.isSubmitted}
            onOpen={() => navigate(`/scoring/${MORNING_ROUND_ID}`)}
          />
          <StageCard
            icon={Radio}
            title={
              ROUNDS.find((r) => r.id === CORONATION_ROUND_ID)?.description ??
              "Coronation Night"
            }
            loading={coronation.loading}
            active={!!coronation.session}
            statusLabel={
              coronation.session
                ? categoryFor(coronation) ?? "In progress"
                : progressLabel(coronation) ?? "Not started"
            }
            candidateName={coronation.session?.candidate?.name}
            hasSubmitted={coronation.myScores?.isSubmitted}
            isLocked={coronation.myScores?.isSubmitted}
            onOpen={() => navigate("/finals-scoring")}
          />
          <StageCard
            icon={Trophy}
            title="Top 7"
            statusLabel="Rank the finalists"
            description="Available once the admin opens the final ranking round."
            onOpen={() => navigate("/judge/top5")}
          />
        </div>
      )}
    </div>
  );
}

function StageCard({
  icon: Icon,
  title,
  statusLabel,
  description,
  candidateName,
  hasSubmitted,
  isLocked,
  active,
  loading,
  onOpen,
}: {
  icon: typeof Radio;
  title: string;
  statusLabel: string;
  description?: string;
  candidateName?: string;
  hasSubmitted?: boolean;
  isLocked?: boolean;
  active?: boolean;
  loading?: boolean;
  onOpen: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2 font-semibold">
          <Icon className="size-4 text-primary" />
          {title}
        </div>
        {active && (
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </span>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-16 flex items-center text-sm text-muted-foreground">
            Checking for an active session…
          </div>
        ) : (
          <>
            <div className="text-sm text-muted-foreground mb-1">
              {statusLabel}
            </div>
            {candidateName && (
              <div className="text-lg font-semibold mb-3">
                {candidateName}
              </div>
            )}
            {description && (
              <div className="text-sm text-muted-foreground mb-3">
                {description}
              </div>
            )}
            <Button onClick={onOpen} className="w-full mt-2">
              {isLocked ? (
                <>
                  <Lock className="size-4" /> View (Locked)
                </>
              ) : hasSubmitted ? (
                <>
                  <Sparkles className="size-4" /> View Submission
                </>
              ) : (
                "Open"
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
