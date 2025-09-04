import { useEffect, useRef, useState, useCallback } from "react";
import * as signalR from "@microsoft/signalr";
import { get, post, BASE } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import type {
  ScoringSessionDto,
  ScoringLockChanged,
  RealtimeScoreDto,
} from "@/types/scoring";

type UseScoringOpts = {
  roundId: number;
  onActiveSession?: (s: ScoringSessionDto | null) => void;
  onRealtimeScore?: (r: RealtimeScoreDto) => void;
};

export function useScoring({
  roundId,
  onActiveSession,
  onRealtimeScore,
}: UseScoringOpts) {
  const token = useAuthStore((s) => s.token);
  const [session, setSession] = useState<ScoringSessionDto | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const connectionRef = useRef<signalR.HubConnection | null>(null);
  const sessionRef = useRef<ScoringSessionDto | null>(null);

  const fetchActive = useCallback(async () => {
    setLoading(true);
    try {
      const res = await get(
        `/api/scoring/session/active/${roundId}`,
        token ?? undefined
      );
      sessionRef.current = res;
      console.log(res);

      setSession(res);
      setIsLocked(res?.isLocked ?? false);
      onActiveSession?.(res);

      return res;
    } catch (err) {
      // 404 => no active session (runtime error object may contain status)
      if (
        err &&
        typeof err === "object" &&
        err !== null &&
        "status" in err &&
        Number((err as unknown as { status?: unknown }).status) === 404
      ) {
        setSession(null);
        onActiveSession?.(null);
        return null;
      }
      throw err;
    } finally {
      setLoading(false);
    }
  }, [roundId, token, onActiveSession]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      await fetchActive();

      if (!token) return;

      const conn = new signalR.HubConnectionBuilder()
        .withUrl(`${BASE}/scoringHub`, { accessTokenFactory: () => token })
        .withAutomaticReconnect()
        .configureLogging(signalR.LogLevel.Warning)
        .build();

      conn.on("ActiveCandidateChanged", async (payload: unknown) => {
        if (!mounted) return;
        if (
          typeof payload === "object" &&
          payload !== null &&
          Object.prototype.hasOwnProperty.call(payload, "isActive")
        ) {
          const p = payload as { id: string; isActive: boolean };
          if (p.isActive === false) {
            setSession(null);
            onActiveSession?.(null);
            return;
          }
        }
        // refresh active session whenever an active candidate change arrives
        await fetchActive();
      });

      conn.on("ScoringLockChanged", (p: ScoringLockChanged) => {
        // compare against current session via ref to avoid effect re-creation loops
        if (sessionRef.current && p.sessionId === sessionRef.current.id) {
          setIsLocked(p.isLocked);
        }
      });

      conn.on("ScoreUpdated", (r: RealtimeScoreDto) => {
        onRealtimeScore?.(r);
      });

      await conn.start();
      connectionRef.current = conn;

      conn.onreconnected(async () => {
        await fetchActive();
      });
    })();

    return () => {
      mounted = false;
      const c = connectionRef.current;
      if (c) {
        void c.stop();
        connectionRef.current = null;
      }
    };
    // include handlers in deps to avoid stale closures; do NOT include session itself
  }, [fetchActive, token, onActiveSession, onRealtimeScore]);

  async function submitScore(scoreValue: number) {
    if (!token) throw new Error("Not authenticated");
    if (!session) throw new Error("No active session");
    if (isLocked) throw new Error("Session is locked");
    const payload = {
      candidateId: session.candidateId,
      categoryId: session.categoryId,
      scoreValue,
      scoringSessionId: session.id,
    };
    try {
      const res = await post(
        `/api/scoring/scores`,
        payload,
        token ?? undefined
      );
      return res;
    } catch (err: unknown) {
      // if server says session invalid/locked, re-fetch
      await fetchActive();
      throw err;
    }
  }

  return {
    session,
    isLocked,
    loading,
    fetchActive,
    submitScore,
    connection: connectionRef.current,
  };
}
