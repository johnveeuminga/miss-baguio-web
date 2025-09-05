import { useCallback, useEffect, useRef, useState } from "react";
import * as signalR from "@microsoft/signalr";
import { get, BASE } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import type {
  ScoringSessionDto,
  ScoringLockChanged,
  ScoreSubmittedDto,
  RealtimeScoreDto,
} from "@/types/scoring";
import type { Candidate } from "@/types/candidate";
import type { Category, Round } from "@/lib/rounds";

export type SnapshotScore = {
  judgeNumber?: number;
  judgeId?: string;
  scoreValue: number;
  judgeName?: string;
};

export type SnapshotDto = {
  sessionId?: string;
  candidateId?: number;
  categoryId?: number | null;
  roundId?: number;
  isLocked?: boolean;
  judgeScores?: SnapshotScore[];
  scores?: SnapshotScore[];
  aggregates?: {
    average?: number;
    count?: number;
  };
  currentAverage?: number;
  countSubmitted?: number;
  candidate?: Candidate;
  category?: Category;
  round?: Round;
  preferredPhotoUrl?: string | null;
  fullPhotoUrl?: string | null;
  fullPhotoReady?: boolean;
};

export function useViewerScoring(opts: { roundId: number }) {
  const { roundId } = opts;
  const token = useAuthStore((s) => s.token);
  const [session, setSession] = useState<ScoringSessionDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [snapshot, setSnapshot] = useState<SnapshotDto | null>(null);

  const connectionRef = useRef<signalR.HubConnection | null>(null);
  const sessionRef = useRef<ScoringSessionDto | null>(null);

  const computeAggregates = useCallback(
    (scores: SnapshotScore[] | undefined) => {
      if (!scores || scores.length === 0) return { average: 0, count: 0 };
      const vals = scores.map((s) => s.scoreValue);
      const count = vals.length;
      const sum = vals.reduce((a, b) => a + b, 0);
      return { average: sum / count, count };
    },
    []
  );

  const fetchActive = useCallback(async () => {
    setLoading(true);
    try {
      const res = (await get(
        `/api/scoring/session/active/${roundId}`,
        token ?? undefined
      )) as ScoringSessionDto | null;
      sessionRef.current = res ?? null;
      setSession(res ?? null);
      setIsLocked(res?.isLocked ?? false);
      return res ?? null;
    } finally {
      setLoading(false);
    }
  }, [roundId, token]);

  const fetchSnapshot = useCallback(
    async (sessionId?: string) => {
      if (!sessionId) return null;
      try {
        const s = (await get(
          `/api/scoring/session/${sessionId}/snapshot`,
          token ?? undefined
        )) as SnapshotDto;
        // derive preferred small photo (append -300x375 before extension)
        const photoUrl = s?.candidate?.photoUrl ?? null;

        function deriveSized(url: string | undefined | null, suffix: string) {
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

        const small = deriveSized(photoUrl, "-300x375");
        const full = photoUrl ?? null;
        const out = {
          ...(s ?? {}),
          preferredPhotoUrl: small,
          fullPhotoUrl: full,
          fullPhotoReady: false,
        } as SnapshotDto;
        setSnapshot(out ?? null);
        return s;
      } catch (e) {
        console.debug("fetch snapshot failed", e);
        setSnapshot(null);
        return null;
      }
    },
    [token]
  );

  useEffect(() => {
    let mounted = true;

    void (async () => {
      await fetchActive();

      // if no session or no token, don't start hub
      if (!token) return;

      const conn = new signalR.HubConnectionBuilder()
        .withUrl(`${BASE}/scoringHub`, { accessTokenFactory: () => token })
        .withAutomaticReconnect()
        .configureLogging(signalR.LogLevel.Warning)
        .build();

      conn.on("ActiveCandidateChanged", async () => {
        if (!mounted) return;
        const s = await fetchActive();
        if (s?.id) {
          await fetchSnapshot(s.id);

          await conn.invoke("LeaveSession", sessionRef.current?.id);
          await conn.invoke("JoinSession", s.id);
        } else {
          setSnapshot(null);
        }
      });

      conn.on("ScoringLockChanged", (p: ScoringLockChanged) => {
        if (sessionRef.current && p.sessionId === sessionRef.current.id) {
          setIsLocked(p.isLocked);
        }
      });

      conn.on("ScoreSubmitted", (p: ScoreSubmittedDto) => {
        if (
          p.sessionId &&
          sessionRef.current &&
          p.sessionId === sessionRef.current.id
        ) {
          void fetchSnapshot(p.sessionId);
        }
      });

      conn.on("ScoreUpdated", (r: RealtimeScoreDto) => {
        if (
          r &&
          sessionRef.current &&
          r.candidateId === sessionRef.current.candidateId
        ) {
          void fetchSnapshot(sessionRef.current.id);
        }
      });

      try {
        await conn.start();
        connectionRef.current = conn;
        setIsConnected(true);

        conn.onreconnected(async () => {
          await fetchActive();
          if (sessionRef.current?.id)
            await fetchSnapshot(sessionRef.current.id);
        });

        if (sessionRef.current?.id) {
          try {
            await conn.invoke("JoinSession", sessionRef.current.id);
            await fetchSnapshot(sessionRef.current.id);
          } catch (e) {
            console.debug("join session failed", e);
          }
        }
      } catch (e) {
        console.debug("hub start failed", e);
      }
    })();

    return () => {
      mounted = false;
      const c = connectionRef.current;
      if (c) {
        // attempt to leave session if we joined
        try {
          if (sessionRef.current?.id) {
            void c.invoke("LeaveSession", sessionRef.current.id);
          }
        } catch (e) {
          console.debug("leave session failed", e);
        }
        void c.stop();
        connectionRef.current = null;
        setIsConnected(false);
      }
    };
  }, [fetchActive, fetchSnapshot, token]);

  return {
    session,
    loading,
    isLocked,
    isConnected,
    snapshot,
    fetchActive,
    fetchSnapshot,
    connection: connectionRef.current,
    computeAggregates,
  };
}
