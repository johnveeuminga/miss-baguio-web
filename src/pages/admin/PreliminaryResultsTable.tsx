import { useEffect, useState } from "react";
import { get } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import type { CandidateFullTableDto } from "./types";
import { cn } from "@/lib/utils";

/**
 * Preliminaries-only tally (Q&A + Creative Costume) — so the admin/EC can
 * review it right after Preliminaries wraps, without waiting for
 * Coronation Night to see any ranking at all. Backed by
 * GET /api/results/preliminary/full, which already ranks by the same
 * weighted-total formula as every other results view; this just surfaces
 * it as its own tab instead of only living inside the "All Scores"
 * 4-category combined table.
 *
 * Judge columns per category come from however many judges are actually
 * seated for that specific category — a category capped via
 * Category.ExpectedJudgeCount (e.g. Q&A judged by only 3) shows exactly
 * those columns, not a fixed 9.
 */
export default function PreliminaryResultsTable() {
  const token = useAuthStore((s) => s.token);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CandidateFullTableDto[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const res = (await get(
          "/api/results/preliminary/full",
          token ?? undefined
        )) as CandidateFullTableDto[];
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
    return <div>Loading Preliminaries results…</div>;
  }

  if (!loading && results.length === 0) {
    return <div>No results</div>;
  }

  const sorted = [...results].sort((a, b) => a.candidateNo - b.candidateNo);

  // Category list/order + per-category judge-column count come from
  // whichever candidate row happens to have the most judge entries for
  // that category — every row carries the same category set (the backend
  // fills every category for every candidate, blank cells and all), so
  // the first row's shape is representative.
  const categoryDefs = (sorted[0]?.categoryScores ?? []).map((c) => ({
    categoryId: c.categoryId,
    categoryName: c.categoryName,
    judgeCount: Math.max(
      0,
      ...sorted.map(
        (r) =>
          r.categoryScores.find((rc) => rc.categoryId === c.categoryId)
            ?.judgeScores?.length ?? 0
      )
    ),
  }));

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
            {categoryDefs.map((cat) => (
              <th
                key={`hdr-${cat.categoryId}`}
                className="border px-2 py-1 text-left"
                colSpan={cat.judgeCount + 2}
              >
                {cat.categoryName}
              </th>
            ))}
            <th className="border px-2 py-1 text-left" rowSpan={2}>
              Preliminaries Total
            </th>
            <th className="border px-2 py-1 text-left" rowSpan={2}>
              Rank
            </th>
          </tr>
          <tr>
            <th className="border px-2 py-1 text-left">No</th>
            <th className="border px-2 py-1 text-left">Name</th>
            {categoryDefs.map((cat) => (
              <>
                {Array.from({ length: cat.judgeCount }).map((_, i) => (
                  <th
                    key={`j-${cat.categoryId}-${i}`}
                    className="border px-2 py-1 text-left"
                  >{`J${i + 1}`}</th>
                ))}
                <th
                  key={`avg-${cat.categoryId}`}
                  className="border px-2 py-1 text-left"
                >
                  Avg
                </th>
                <th
                  key={`w-${cat.categoryId}`}
                  className="border px-2 py-1 text-left"
                >
                  W
                </th>
              </>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.candidateId}>
              <td className="border px-2 py-1">{r.candidateNo}</td>
              <td className="border px-2 py-1">{r.candidateName}</td>
              {categoryDefs.map((cat) => {
                const cs = r.categoryScores.find(
                  (rc) => rc.categoryId === cat.categoryId
                );
                return (
                  <>
                    {Array.from({ length: cat.judgeCount }).map((_, idx) => (
                      <td
                        key={`jc-${r.candidateId}-${cat.categoryId}-${idx}`}
                        className="border px-2 py-1 text-right"
                      >
                        {cs?.judgeScores &&
                        cs.judgeScores[idx] &&
                        cs.judgeScores[idx].score != null
                          ? cs.judgeScores[idx].score!.toFixed(2)
                          : "—"}
                      </td>
                    ))}
                    <td
                      key={`avgc-${r.candidateId}-${cat.categoryId}`}
                      className="border px-2 py-1 text-right"
                    >
                      {cs?.averageScore != null
                        ? cs.averageScore.toFixed(2)
                        : "—"}
                    </td>
                    <td
                      key={`wc-${r.candidateId}-${cat.categoryId}`}
                      className="border px-2 py-1 text-right"
                    >
                      {cs?.weightedContribution != null
                        ? cs.weightedContribution.toFixed(2)
                        : "—"}
                    </td>
                  </>
                );
              })}
              <td className="border px-2 py-1 text-right">
                {r.weightedTotal != null ? r.weightedTotal.toFixed(2) : "—"}
              </td>
              <td
                className={cn(
                  r.rank != null && r.rank <= 7 ? "font-bold text-primary" : "",
                  "border px-2 py-1"
                )}
              >
                {r.rank ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
