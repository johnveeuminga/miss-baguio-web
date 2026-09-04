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
 * weighted-total formula as every other results view.
 *
 * Laid out as separate stacked scoresheets — one per category, Creative
 * Costume below Q&A — each mirroring the /admin/active Scoresheet (candidate
 * #, name, a column per seated judge, Avg, W), then a combined
 * Preliminaries Tally (the two weighted contributions -> total + rank).
 * This is deliberately NOT one wide side-by-side grid: the printout needs
 * to read like the physical scoresheets the panel signs off on, one
 * category per block.
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

  // Category list/order + the judge columns for each category. The backend
  // returns judgeScores in a consistent order for every candidate row of a
  // given category (claim order for capped categories, judge-id order
  // otherwise — see ResultsController.GetFullPreliminaryTable), so column
  // index N is the same judge in every row. Take the judge list (real
  // names + ids, not just a count) from whichever row has the most entries
  // for that category, so a candidate nobody scored yet doesn't shrink the
  // header.
  const categoryDefs = (sorted[0]?.categoryScores ?? []).map((c) => {
    const judges =
      sorted
        .map(
          (r) =>
            r.categoryScores.find((rc) => rc.categoryId === c.categoryId)
              ?.judgeScores ?? []
        )
        .reduce((best, cur) => (cur.length > best.length ? cur : best), [] as {
          judgeId: number;
          judgeName: string;
          score: number | null;
        }[])
        .map((j) => ({ judgeId: j.judgeId, judgeName: j.judgeName }));
    return {
      categoryId: c.categoryId,
      categoryName: c.categoryName,
      weightPercentage: c.weightPercentage,
      judges,
      judgeCount: judges.length,
    };
  });

  return (
    <div className="printable space-y-8">
      {/* One scoresheet per category, stacked (Creative Costume under Q&A) —
          each mirrors the /admin/active Scoresheet so the print matches the
          on-screen look the panel is used to. */}
      {categoryDefs.map((cat) => (
        <section key={`sheet-${cat.categoryId}`} className="break-inside-avoid">
          <h3 className="mb-2 text-sm font-semibold">
            {cat.categoryName}
            {cat.weightPercentage != null ? ` — ${cat.weightPercentage}%` : ""}
          </h3>
          <div className="overflow-auto">
            <table
              className="min-w-full border-collapse table-auto"
              style={{ borderColor: "#000" }}
            >
              <thead>
                <tr>
                  <th className="border px-2 py-1 text-left">No</th>
                  <th className="border px-2 py-1 text-left">Name</th>
                  {cat.judges.map((j, i) => (
                    <th
                      key={`h-${cat.categoryId}-${j.judgeId}-${i}`}
                      className="border px-2 py-1 text-right whitespace-nowrap"
                    >
                      {j.judgeName || `J${i + 1}`}
                    </th>
                  ))}
                  <th className="border px-2 py-1 text-right">Avg</th>
                  <th className="border px-2 py-1 text-right">
                    W ({cat.weightPercentage ?? "?"}%)
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const cs = r.categoryScores.find(
                    (rc) => rc.categoryId === cat.categoryId
                  );
                  return (
                    <tr key={`row-${cat.categoryId}-${r.candidateId}`}>
                      <td className="border px-2 py-1">{r.candidateNo}</td>
                      <td className="border px-2 py-1">{r.candidateName}</td>
                      {cat.judges.map((j, idx) => {
                        // Align by judgeId, not array position — the backend
                        // order is consistent per category, but matching on
                        // id is robust even if a row is ever short an entry.
                        const cell =
                          cs?.judgeScores?.find(
                            (js) => js.judgeId === j.judgeId
                          ) ?? cs?.judgeScores?.[idx];
                        return (
                          <td
                            key={`c-${cat.categoryId}-${r.candidateId}-${j.judgeId}-${idx}`}
                            className="border px-2 py-1 text-right"
                          >
                            {cell && cell.score != null
                              ? cell.score.toFixed(2)
                              : "—"}
                          </td>
                        );
                      })}
                      <td className="border px-2 py-1 text-right font-semibold">
                        {cs?.averageScore != null
                          ? cs.averageScore.toFixed(2)
                          : "—"}
                      </td>
                      <td className="border px-2 py-1 text-right">
                        {cs?.weightedContribution != null
                          ? cs.weightedContribution.toFixed(2)
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {/* Combined Preliminaries tally — the per-category weighted
          contributions (20% + 20%) summed into the Preliminaries Total the
          Top 7 cut is read off. */}
      <section className="break-inside-avoid">
        <h3 className="mb-2 text-sm font-semibold">
          Preliminaries Tally
          {categoryDefs.length > 0
            ? ` — ${categoryDefs
                .map((c) => `${c.categoryName} ${c.weightPercentage ?? "?"}%`)
                .join(" + ")}`
            : ""}
        </h3>
        <div className="overflow-auto">
          <table
            className="min-w-full border-collapse table-auto"
            style={{ borderColor: "#000" }}
          >
            <thead>
              <tr>
                <th className="border px-2 py-1 text-left">No</th>
                <th className="border px-2 py-1 text-left">Name</th>
                {categoryDefs.map((cat) => (
                  <th
                    key={`tally-h-${cat.categoryId}`}
                    className="border px-2 py-1 text-right whitespace-nowrap"
                  >
                    {cat.categoryName} W ({cat.weightPercentage ?? "?"}%)
                  </th>
                ))}
                <th className="border px-2 py-1 text-right">
                  Preliminaries Total
                </th>
                <th className="border px-2 py-1 text-left">Rank</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={`tally-${r.candidateId}`}>
                  <td className="border px-2 py-1">{r.candidateNo}</td>
                  <td className="border px-2 py-1">{r.candidateName}</td>
                  {categoryDefs.map((cat) => {
                    const cs = r.categoryScores.find(
                      (rc) => rc.categoryId === cat.categoryId
                    );
                    return (
                      <td
                        key={`tally-w-${r.candidateId}-${cat.categoryId}`}
                        className="border px-2 py-1 text-right"
                      >
                        {cs?.weightedContribution != null
                          ? cs.weightedContribution.toFixed(2)
                          : "—"}
                      </td>
                    );
                  })}
                  <td className="border px-2 py-1 text-right font-semibold">
                    {r.weightedTotal != null ? r.weightedTotal.toFixed(2) : "—"}
                  </td>
                  <td
                    className={cn(
                      r.rank != null && r.rank <= 7
                        ? "font-bold text-primary"
                        : "",
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
      </section>
    </div>
  );
}
