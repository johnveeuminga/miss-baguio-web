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
  const maxJudges = Math.max(
    0,
    ...sorted.map((r) => r.judgeRankings?.length ?? 0)
  );

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
            {Array.from({ length: maxJudges }).map((_, i) => (
              <th key={`j-${i}`} className="border px-2 py-1">{`J${i + 1}`}</th>
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
              {Array.from({ length: maxJudges }).map((_, idx) => (
                <td
                  key={`jr-${c.candidateId}-${idx}`}
                  className="border px-2 py-1 text-right"
                >
                  {c.judgeRankings &&
                  c.judgeRankings[idx] &&
                  c.judgeRankings[idx].rankPosition != null
                    ? String(c.judgeRankings[idx].rankPosition)
                    : "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
