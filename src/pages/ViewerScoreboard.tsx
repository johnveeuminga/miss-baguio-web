import { useViewerScoring } from "@/hooks/useViewerScoring";
import { useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function ViewerScoreboard() {
  const { session, loading, snapshot } = useViewerScoring({ roundId: 2 });

  // reset loader when the candidate/photo changes
  useEffect(() => {
    // setImgLoaded(false);
  }, [
    snapshot?.preferredPhotoUrl,
    snapshot?.candidate?.photoUrl,
    snapshot?.candidateId,
  ]);

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
