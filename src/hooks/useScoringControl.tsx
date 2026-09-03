import { useCallback, useEffect, useState } from "react";
import { get } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useScoringHubConnection } from "@/hooks/useScoringHubConnection";
import type { ScoringControlDto } from "@/types/scoring";

/**
 * The admin-controlled "which category is currently open for scoring"
 * lock — per the Executive Committee, judges can freely score any
 * candidate within a round, but only in the ONE category admin has
 * active (avoids mis-scoring the wrong category from a mistap). Backed
 * by GET/PUT /api/scoring/control, which already existed but had no
 * frontend consumer before this. Live-updates via the shared scoringHub
 * connection's ScoringControlUpdated broadcast (also already wired
 * server-side, previously unused).
 */
export function useScoringControl() {
  const token = useAuthStore((s) => s.token);
  const [control, setControl] = useState<ScoringControlDto | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = (await get(
        "/api/scoring/control",
        token ?? undefined
      )) as ScoringControlDto;
      setControl(res);
    } catch {
      // No control row yet, or not reachable — treat as "nothing active",
      // which is the same safe default as a genuinely unset control.
      setControl(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const hubConnection = useScoringHubConnection(token);
  useEffect(() => {
    if (!hubConnection) return;
    const onUpdated = (payload: ScoringControlDto) => setControl(payload);
    hubConnection.on("ScoringControlUpdated", onUpdated);
    return () => {
      hubConnection.off("ScoringControlUpdated", onUpdated);
    };
  }, [hubConnection]);

  return { control, loading, reload: load };
}
