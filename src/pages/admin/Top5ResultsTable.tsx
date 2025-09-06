import { useEffect, useState } from "react";
import { get } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import type { Top5Dto } from "./types";

export default function Top5ResultsTable() {
  const token = useAuthStore((s) => s.token);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Top5Dto[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const res = (await get(
          "/api/admin/results/top5",
          token ?? undefined
        )) as Top5Dto[];
        if (!mounted) return;
        setResults(res ?? []);
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [token]);

  if (loading) return <div>Loading Top 5…</div>;
  if (!loading && results.length === 0) return <div>No Top 5 results</div>;

  const sorted = [...results].sort(
    (a, b) => (a.finalRank ?? 0) - (b.finalRank ?? 0)
  );

  // Build a unique list of judges found in the results and sort by judgeId
  const judgeMap = new Map<number, string | undefined>();
  for (const r of sorted) {
    if (!r.judgeRankings) continue;
    for (const jr of r.judgeRankings) {
      if (!judgeMap.has(jr.judgeId)) judgeMap.set(jr.judgeId, jr.judgeName);
    }
  }
  const judges = Array.from(judgeMap.entries())
    .map(([judgeId, judgeName]) => ({ judgeId, judgeName }))
    .sort((a, b) => a.judgeId - b.judgeId);
  const maxJudges = judges.length;

  return (
    <div className="overflow-auto printable">
      <table
        className="min-w-full border-collapse table-auto"
        style={{ borderColor: "#000" }}
      >
        <thead>
          <tr>
            <th className="border px-2 py-1 text-left" colSpan={3}>
              Candidate
            </th>
            <th className="border px-2 py-1 text-left">Total Score</th>
            <th className="border px-2 py-1 text-left">Rank</th>
            {maxJudges > 0 && (
              <th className="border px-2 py-1" colSpan={maxJudges}>
                Judge Rankings
              </th>
            )}
          </tr>
          <tr>
            <th className="border px-2 py-1 text-left">No</th>
            <th className="border px-2 py-1 text-left">Name</th>
            <th className="border px-2 py-1 text-left">Title</th>
            <th className="border px-2 py-1 text-left">Total</th>
            <th className="border px-2 py-1 text-left">Rank</th>
            {judges.map((j) => (
              <th key={`j-${j.judgeId}`} className="border px-2 py-1">{`J${j.judgeId}`}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr key={c.candidateId}>
              <td className="border px-2 py-1">{c.candidateId}</td>
              <td className="border px-2 py-1">{c.candidateName}</td>
              <td className="border px-2 py-1 font-bold">{c.title ?? "—"}</td>
              <td className="border px-2 py-1 text-right">
                {c.totalScore != null ? c.totalScore.toFixed(2) : "—"}
              </td>
              <td className="border px-2 py-1">{c.finalRank ?? "—"}</td>
              {judges.map((j) => {
                const jr = c.judgeRankings?.find((x) => x.judgeId === j.judgeId) ?? null;
                return (
                  <td
                    key={`jr-${c.candidateId}-${j.judgeId}`}
                    className="border px-2 py-1 text-right"
                  >
                    {jr && jr.rankPosition != null ? String(jr.rankPosition) : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
