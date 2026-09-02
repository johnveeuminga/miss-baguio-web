import { useViewerScoring } from "@/hooks/useViewerScoring";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LoadingView, EmptyView } from "@/components/ui/status-view";

export default function ViewerScoreboard() {
  const { session, loading, snapshot } = useViewerScoring({ roundId: 2 });

  if (loading) return <LoadingView label="Loading scoreboard…" className="p-8" />;

  if (!session)
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Viewer Scoreboard</h1>
        <EmptyView
          title="Waiting for admin"
          description="No active session yet. Scores will appear here as soon as one starts."
        />
      </div>
    );

  if (!snapshot)
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Viewer Scoreboard</h1>
        <EmptyView title="No snapshot available for this session" />
      </div>
    );

  return (
    <div className="p-8">
      <div className="flex items-baseline justify-between mb-4">
        <h1 className="text-2xl font-bold">
          {snapshot.round?.description || "Miss Baguio 2025"} -{" "}
          {snapshot?.category?.description || "Unknown Category"}
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-6 items-start">
        <div className="md:col-span-2">
          <Card>
            <CardHeader className="font-bold">
              #{snapshot?.candidateId} - {snapshot.candidate?.name}
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {snapshot.judgeScores && snapshot.judgeScores.length > 0 ? (
                  snapshot.judgeScores.map((s, i) => {
                    const val = s.scoreValue ?? 0;

                    return (
                      <div
                        key={i}
                        className="flex justify-center items-center py-2 border-b last:border-b-0"
                      >
                        <div className="text-lg text-center">
                          {Number(val).toFixed(1)}
                        </div>
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
