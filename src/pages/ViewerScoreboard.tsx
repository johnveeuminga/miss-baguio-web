import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import type { ActiveCandidateResponse } from "@/types/candidate";

export default function ViewerScoreboard() {
  const token = useAuthStore((s) => s.token);
  const { data, isLoading } = useQuery({
    queryKey: ["activeCandidate"],
    queryFn: () => get("/api/active-candidate", token ?? undefined),
  });

  if (isLoading) return <div className="p-8">Loading…</div>;
  const candidate = (data as ActiveCandidateResponse | undefined)?.candidate;
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Viewer Scoreboard</h1>
      {!candidate ? (
        <div>No active candidate</div>
      ) : (
        <div>Scores for {candidate.name}</div>
      )}
    </div>
  );
}
