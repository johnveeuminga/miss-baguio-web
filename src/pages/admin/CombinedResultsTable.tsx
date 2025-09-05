import { useEffect, useState } from "react";
import { get } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import type { CandidateCombinedResultDto } from "./types";
import { cn } from "@/lib/utils";

export default function CombinedResultsTable() {
  const token = useAuthStore((s) => s.token);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CandidateCombinedResultDto[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const res = (await get(
          "/api/admin/results/prelims-finals",
          token ?? undefined
        )) as CandidateCombinedResultDto[];
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

  if (loading) {
    return <div>Loading combined results…</div>;
  }

  if (!loading && results.length === 0) {
    return <div>No results</div>;
  }

  const sorted = [...results].sort(
    (a, b) => (a.candidateId ?? 0) - (b.candidateId ?? 0)
  );
  const maxEvening = Math.max(
    0,
    ...sorted.map(
      (r) =>
        r.finalsCategories?.find((c) => c.categoryName === "Evening Gown")
          ?.judgeScores?.length ?? 0
    )
  );
  const maxSwimsuit = Math.max(
    0,
    ...sorted.map(
      (r) =>
        r.finalsCategories?.find(
          (c) => c.categoryName === "Swimsuit (Second Round)"
        )?.judgeScores?.length ?? 0
    )
  );

  return (
    <div className="overflow-auto printable">
      <table
        className="min-w-full border-collapse table-auto"
        style={{ borderColor: "#000" }}
      >
        <thead>
          <tr>
            <th className="border px-2 py-1 text-left" colSpan={2}>
              Candidate
            </th>
            {maxEvening > 0 && (
              <th
                className="border px-2 py-1 text-left"
                colSpan={maxEvening + 2}
              >
                Evening Gown
              </th>
            )}
            {maxSwimsuit > 0 && (
              <th
                className="border px-2 py-1 text-left"
                colSpan={maxSwimsuit + 2}
              >
                Swimsuit Round 2
              </th>
            )}
            <th className="border px-2 py-1 text-left">Prelim Total</th>
            <th className="border px-2 py-1 text-left">Final Total</th>
            <th className="border px-2 py-1 text-left">Rank</th>
          </tr>
          <tr>
            <th className="border px-2 py-1 text-left">No</th>
            <th className="border px-2 py-1 text-left">Name</th>
            {Array.from({ length: maxEvening }).map((_, i) => (
              <th key={`eg-j${i}`} className="border px-2 py-1 text-left">{`J${
                i + 1
              }`}</th>
            ))}
            {maxEvening > 0 && (
              <>
                <th className="border px-2 py-1 text-left">Avg</th>
                <th className="border px-2 py-1 text-left">W</th>
              </>
            )}
            {Array.from({ length: maxSwimsuit }).map((_, i) => (
              <th key={`sw-j${i}`} className="border px-2 py-1 text-left">{`J${
                i + 1
              }`}</th>
            ))}
            {maxSwimsuit > 0 && (
              <>
                <th className="border px-2 py-1 text-left">Avg</th>
                <th className="border px-2 py-1 text-left">W</th>
              </>
            )}
            <th className="border px-2 py-1 text-left">Prelim</th>
            <th className="border px-2 py-1 text-left">Final</th>
            <th className="border px-2 py-1 text-left">Rank</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const eg = r.finalsCategories?.find(
              (c) => c.categoryName === "Evening Gown"
            );
            const sw = r.finalsCategories?.find(
              (c) => c.categoryName === "Swimsuit (Second Round)"
            );
            return (
              <tr key={r.candidateId}>
                <td className="border px-2 py-1">{r.candidateId}</td>
                <td className="border px-2 py-1">{r.candidateName}</td>
                {Array.from({ length: maxEvening }).map((_, idx) => (
                  <td
                    key={`eg-${r.candidateId}-${idx}`}
                    className="border px-2 py-1 text-right"
                  >
                    {eg?.judgeScores &&
                    eg.judgeScores[idx] &&
                    eg.judgeScores[idx].score != null
                      ? eg.judgeScores[idx].score.toFixed(2)
                      : "—"}
                  </td>
                ))}
                {maxEvening > 0 && (
                  <>
                    <td className="border px-2 py-1 text-right">
                      {eg?.averageScore != null
                        ? eg.averageScore.toFixed(2)
                        : "—"}
                    </td>
                    <td className="border px-2 py-1 text-right">
                      {eg?.weightedContribution != null
                        ? eg.weightedContribution.toFixed(2)
                        : "—"}
                    </td>
                  </>
                )}
                {Array.from({ length: maxSwimsuit }).map((_, idx) => (
                  <td
                    key={`sw-${r.candidateId}-${idx}`}
                    className="border px-2 py-1 text-right"
                  >
                    {sw?.judgeScores &&
                    sw.judgeScores[idx] &&
                    sw.judgeScores[idx].score != null
                      ? sw.judgeScores[idx].score.toFixed(2)
                      : "—"}
                  </td>
                ))}
                {maxSwimsuit > 0 && (
                  <>
                    <td className="border px-2 py-1 text-right">
                      {sw?.averageScore != null
                        ? sw.averageScore.toFixed(2)
                        : "—"}
                    </td>
                    <td className="border px-2 py-1 text-right">
                      {sw?.weightedContribution != null
                        ? sw.weightedContribution.toFixed(2)
                        : "—"}
                    </td>
                  </>
                )}
                <td className="border px-2 py-1 text-right">
                  {r.preliminaryWeightedTotal != null
                    ? r.preliminaryWeightedTotal.toFixed(2)
                    : "—"}
                </td>
                <td className="border px-2 py-1 text-right">
                  {r.finalsWeightedTotal != null
                    ? r.finalsWeightedTotal.toFixed(2)
                    : "—"}
                </td>
                <td
                  className={cn(
                    r.finalRank != null && r.finalRank <= 5
                      ? "font-bold text-primary"
                      : "",
                    "border px-2 py-1"
                  )}
                >
                  {r.finalRank ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
