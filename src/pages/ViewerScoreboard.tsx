import { useViewerScoring } from "@/hooks/useViewerScoring";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function ViewerScoreboard() {
  const { session, loading, snapshot, isConnected, isLocked } =
    useViewerScoring({ roundId: 2 });

  if (loading) return <div className="p-8">Loading…</div>;

  if (!session)
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Viewer Scoreboard</h1>
        <div>Waiting for admin to start a session.</div>
      </div>
    );

  if (!snapshot)
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Viewer Scoreboard</h1>
        <div>No snapshot available for this session.</div>
      </div>
    );

  return (
    <div className="p-8">
      <div className="flex items-baseline justify-between mb-4">
        <h1 className="text-2xl font-bold">
          {snapshot.round?.description || "Miss Baguio 2025"} -{" "}
          {snapshot?.category?.description || "Unknown Category"}
        </h1>
        <div className="text-sm text-muted-foreground">
          {isConnected ? "Connected" : "Disconnected"} •{" "}
          {isLocked ? "Locked" : "Open"}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        <div className="md:col-span-1 flex items-center justify-center">
          <div
            className="w-full max-w-[520px] rounded-md overflow-hidden bg-[color:var(--muted-fill)] relative"
            style={{ aspectRatio: "4 / 5" }}
          >
            {snapshot.candidate?.photoUrl ? (
              <img
                src={snapshot.candidate.photoUrl}
                alt={snapshot.candidate.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-6xl font-bold text-[var(--muted-foreground)]">
                {(snapshot.candidate?.name || "U").slice(0, 2).toUpperCase()}
              </div>
            )}

            <div className="absolute left-4 bottom-4 bg-black/60 text-white px-3 py-1 rounded-md">
              <div className="font-semibold text-lg">
                {snapshot.candidate?.name}
              </div>
              <div className="text-sm">{snapshot.candidate?.barangay}</div>
            </div>
          </div>
        </div>

        <div className="md:col-span-2">
          <Card>
            <CardHeader>Scores</CardHeader>
            <CardContent>
              <div className="space-y-2">
                {snapshot.judgeScores && snapshot.judgeScores.length > 0 ? (
                  snapshot.judgeScores.map((s, i) => {
                    const val = s.scoreValue ?? 0;

                    return (
                      <div
                        key={i}
                        className="flex justify-between items-center py-2 border-b last:border-b-0"
                      >
                        <div className="font-bold">{s.judgeName}</div>
                        <div className="text-lg">{Number(val).toFixed(1)}</div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-sm text-muted-foreground">
                    No scores yet
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
