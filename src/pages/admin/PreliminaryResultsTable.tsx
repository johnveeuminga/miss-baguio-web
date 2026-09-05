import { useEffect, useState } from "react";
import { get } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import type { CandidateFullTableDto, ResultsMode } from "./types";
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
export default function PreliminaryResultsTable({
  mode = "detailed",
}: {
  mode?: ResultsMode;
}) {
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

  // Announce view — a placement sheet for the host: ranked order, candidate
  // number, name, Preliminaries Total, Rank. No judge columns, no weighting
  // math. A candidate is only "placed" once she has an actual non-zero
  // total — otherwise Place shows "—" with no star and she sinks to the
  // bottom, so an all-zero pre-scoring sheet doesn't read like a standing.
  if (mode === "announce") {
    const isPlaced = (r: CandidateFullTableDto): boolean =>
      r.rank != null && r.weightedTotal != null && r.weightedTotal > 0;
    const ranked = [...results].sort((a, b) => {
      const pa = isPlaced(a);
      const pb = isPlaced(b);
      if (pa !== pb) return pa ? -1 : 1;
      if (pa && pb) return (a.rank ?? 0) - (b.rank ?? 0);
      return a.candidateNo - b.candidateNo;
    });
    const anyPlaced = results.some(isPlaced);
    return (
      <div className="printable" data-print-mode="announce">
        <h3 className="mb-2 text-base font-semibold">
          Preliminaries — Standings
        </h3>
        {!anyPlaced && (
          <p className="mb-2 text-xs font-medium text-amber-700 dark:text-amber-400">
            No scores yet — nobody is placed. This sheet fills in as judges
            score.
          </p>
        )}
        <div className="overflow-auto">
          <table
            className="min-w-full border-collapse table-auto text-base"
            style={{ borderColor: "#000" }}
          >
            <thead>
              <tr>
                <th className="border px-3 py-2 text-left">Place</th>
                <th className="border px-3 py-2 text-left">#</th>
                <th className="border px-3 py-2 text-left">Candidate</th>
                <th className="border px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r) => {
                const placed = isPlaced(r);
                return (
                  <tr
                    key={r.candidateId}
                    className={cn(
                      placed && r.rank != null && r.rank <= 7 ? "font-bold" : ""
                    )}
                  >
                    <td className="border px-3 py-2">
                      {placed ? r.rank : "—"}
                      {placed && r.rank != null && r.rank <= 7 ? " ★" : ""}
                    </td>
                    <td className="border px-3 py-2">{r.candidateNo}</td>
                    <td className="border px-3 py-2">{r.candidateName}</td>
                    <td className="border px-3 py-2 text-right">
                      {r.weightedTotal != null && r.weightedTotal > 0
                        ? r.weightedTotal.toFixed(2)
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          ★ = current Top 7. Total is Q&amp;A + Creative Costume combined.
        </p>
      </div>
    );
  }

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
    <div className="printable space-y-8" data-print-mode="detailed">
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
                      {/* Print used to show a positional J1..Jn label here
                          while screen showed the real name for that same
                          column. Columns are ordered by claim/seat order,
                          not by anything in a judge's name — so when a
                          judge's actual account name happens to already be
                          "Judge 1"/"Judge 2"/etc (a placeholder from setup),
                          a seat-order J1..Jn label can contradict the name
                          and read as if scores were swapped between judges.
                          Print now shows the same real name as screen —
                          reported live 2026-09-05. */}
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
