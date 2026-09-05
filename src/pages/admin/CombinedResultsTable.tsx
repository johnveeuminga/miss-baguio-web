import { useEffect, useState } from "react";
import { get } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import type { CandidateCombinedResultDto, ResultsMode } from "./types";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";
import SectionPrintButton from "./SectionPrintButton";

export default function CombinedResultsTable({
  mode = "detailed",
}: {
  mode?: ResultsMode;
}) {
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

  // Announce view — a placement sheet for the host: final rank, candidate
  // number, name, barangay, combined total. No judge columns, no per-
  // category weighting.
  if (mode === "announce") {
    // The backend ranks EVERY candidate by combined total even when nothing
    // is scored (all totals 0 -> ranks 1..N in candidate order). Showing
    // that as "1st, 2nd, 3rd…" with stars reads like a real standing when
    // it's just row order. So only treat a candidate as placed once she has
    // an actual non-zero total; everyone else shows "—" and no star, and
    // sinks to the bottom.
    const totalFor = (r: CandidateCombinedResultDto): number | null =>
      r.combinedTotal ??
      (r.morningWeightedTotal != null && r.coronationWeightedTotal != null
        ? r.morningWeightedTotal + r.coronationWeightedTotal
        : null);
    const isPlaced = (r: CandidateCombinedResultDto): boolean => {
      const t = totalFor(r);
      return r.finalRank != null && t != null && t > 0;
    };
    const ranked = [...results].sort((a, b) => {
      const pa = isPlaced(a);
      const pb = isPlaced(b);
      if (pa !== pb) return pa ? -1 : 1;
      if (pa && pb) return (a.finalRank ?? 0) - (b.finalRank ?? 0);
      return (a.candidateId ?? 0) - (b.candidateId ?? 0);
    });
    const anyPartial = results.some((r) => {
      const md = (r.morningCategories ?? []).every((c) => c.averageScore != null);
      const cd = (r.coronationCategories ?? []).every(
        (c) => c.averageScore != null
      );
      return !md || !cd;
    });
    const anyPlaced = results.some(isPlaced);
    return (
      <div className="printable" data-print-mode="announce">
        <h3 className="mb-2 text-base font-semibold">Overall Standings</h3>
        {!anyPlaced ? (
          <p className="mb-2 text-xs font-medium text-amber-700 dark:text-amber-400">
            No scores yet — nobody is placed. This sheet fills in as judges
            score.
          </p>
        ) : anyPartial ? (
          <p className="mb-2 text-xs font-medium text-amber-700 dark:text-amber-400">
            Partial — not every category is fully scored yet. Not final.
          </p>
        ) : null}
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
                <th className="border px-3 py-2 text-left">Barangay</th>
                <th className="border px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r) => {
                const total = totalFor(r);
                const placed = isPlaced(r);
                return (
                  <tr
                    key={r.candidateId}
                    className={cn(
                      placed && r.finalRank != null && r.finalRank <= 7
                        ? "font-bold"
                        : ""
                    )}
                  >
                    <td className="border px-3 py-2">
                      {placed ? r.finalRank : "—"}
                      {placed && r.finalRank != null && r.finalRank <= 7
                        ? " ★"
                        : ""}
                    </td>
                    <td className="border px-3 py-2">{r.candidateId}</td>
                    <td className="border px-3 py-2">{r.candidateName}</td>
                    <td className="border px-3 py-2">{r.barangay ?? "—"}</td>
                    <td className="border px-3 py-2 text-right">
                      {total != null && total > 0 ? total.toFixed(2) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          ★ = Top 7. Total is all four categories combined.
        </p>
      </div>
    );
  }

  // The judge columns for a coronation category — real names + ids, taken
  // from whichever candidate row has the most entries (the backend returns
  // judgeScores in a consistent per-category order for every row). Showing
  // the judge's actual name matches the /admin/active Scoresheet and the
  // Preliminaries Tally; a positional "J1" hid which judge a column was.
  const judgesForCategory = (categoryName: string) =>
    sorted
      .map(
        (r) =>
          r.coronationCategories?.find((c) => c.categoryName === categoryName)
            ?.judgeScores ?? []
      )
      .reduce((best, cur) => (cur.length > best.length ? cur : best), [] as {
        judgeId: number;
        judgeName: string;
        score: number | null;
      }[])
      .map((j) => ({ judgeId: j.judgeId, judgeName: j.judgeName }));

  const eveningJudges = judgesForCategory("Evening Wear");
  const swimsuitJudges = judgesForCategory("Swimwear");

  // A candidate missing an average in ANY of the 4 categories means her
  // combined total/rank on this screen reflects only part of the 100% —
  // e.g. Morning fully scored but Coronation Night hasn't started yet
  // (the "everyone's at lunch" case). CalculateCombinedResults still
  // computes a number for her (missing categories contribute 0), so the
  // table below isn't wrong, just incomplete — flag it so nobody mistakes
  // a lunchtime partial total for the actual final standings.
  const isPartial = sorted.some((r) => {
    const morningDone = (r.morningCategories ?? []).every(
      (c) => c.averageScore != null
    );
    const coronationDone = (r.coronationCategories ?? []).every(
      (c) => c.averageScore != null
    );
    return !morningDone || !coronationDone;
  });

  // One scoresheet per coronation category (Evening Wear, then Swimwear),
  // stacked — same pattern as PreliminaryResultsTable, so a 9-judge panel
  // reads at the same font size as the Q&A/Creative Costume sheets instead
  // of forcing all ~24 columns onto one wide page. A single wide table only
  // fits a full panel by shrinking to ~7px, which is too small to read at
  // the table; stacking keeps each sheet to Name + Jn + Avg + W (~13 cols)
  // at a normal print size, same as Preliminaries.
  const categorySheets: {
    key: string;
    label: string;
    judges: { judgeId: number; judgeName: string }[];
    getCategory: (
      r: CandidateCombinedResultDto
    ) => { averageScore: number | null; weightedContribution: number | null; judgeScores?: { judgeId: number; score: number | null }[] } | undefined;
  }[] = [
    {
      key: "evening-wear",
      label: "Evening Wear",
      judges: eveningJudges,
      getCategory: (r) =>
        r.coronationCategories?.find((c) => c.categoryName === "Evening Wear"),
    },
    {
      key: "swimwear",
      label: "Swimwear",
      judges: swimsuitJudges,
      getCategory: (r) =>
        r.coronationCategories?.find((c) => c.categoryName === "Swimwear"),
    },
  ];

  return (
    <div className="printable space-y-8" data-print-mode="detailed">
      {isPartial && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" />
          <span>
            <strong>Partial results.</strong> Not every candidate has been
            scored in every category yet (e.g. Preliminaries done but
            Coronation Night hasn't started). Ranks and totals below only
            reflect what's been scored so far — they are{" "}
            <strong>not</strong> the final standings.
          </span>
        </div>
      )}

      {categorySheets.map((sheet) => (
        <section
          key={sheet.key}
          className="break-inside-avoid"
          data-print-section={`combined-${sheet.key}`}
        >
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            {sheet.label}
            <SectionPrintButton
              sectionKey={`combined-${sheet.key}`}
              label={sheet.label}
            />
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
                  {/* Print used to collapse to a positional J1..Jn label
                      here while screen showed the real name for that same
                      column — see the note in PreliminaryResultsTable:
                      columns are ordered by claim/seat order, not by
                      anything in a judge's name, so a seat-order label can
                      contradict a judge whose actual account name already
                      contains a number (a "Judge 1"/"Judge 2" placeholder
                      from setup), reading as if scores were swapped.
                      Reported live 2026-09-05 — print now shows the same
                      real name as screen. */}
                  {sheet.judges.map((j, i) => (
                    <th
                      key={`${sheet.key}-j${j.judgeId}-${i}`}
                      className="border px-2 py-1 text-right whitespace-nowrap"
                    >
                      {j.judgeName || `J${i + 1}`}
                    </th>
                  ))}
                  <th className="border px-2 py-1 text-right">Avg</th>
                  <th className="border px-2 py-1 text-right">W</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const cat = sheet.getCategory(r);
                  return (
                    <tr key={`${sheet.key}-${r.candidateId}`}>
                      <td className="border px-2 py-1">{r.candidateId}</td>
                      <td className="border px-2 py-1">{r.candidateName}</td>
                      {sheet.judges.map((j, idx) => {
                        const cell =
                          cat?.judgeScores?.find(
                            (js) => js.judgeId === j.judgeId
                          ) ?? cat?.judgeScores?.[idx];
                        return (
                          <td
                            key={`${sheet.key}-c-${r.candidateId}-${j.judgeId}-${idx}`}
                            className="border px-2 py-1 text-right"
                          >
                            {cell && cell.score != null
                              ? cell.score.toFixed(2)
                              : "—"}
                          </td>
                        );
                      })}
                      <td className="border px-2 py-1 text-right font-semibold">
                        {cat?.averageScore != null
                          ? cat.averageScore.toFixed(2)
                          : "—"}
                      </td>
                      <td className="border px-2 py-1 text-right">
                        {cat?.weightedContribution != null
                          ? cat.weightedContribution.toFixed(2)
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

      {/* Combined tally — Morning + Coronation weighted totals -> final
          rank. No judge columns here, so it stays compact regardless of
          panel size. */}
      <section className="break-inside-avoid" data-print-section="combined-tally">
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          Overall Tally
          <SectionPrintButton sectionKey="combined-tally" label="Overall Tally" />
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
                <th className="border px-2 py-1 text-right whitespace-nowrap">
                  <span className="screen-only">
                    Morning Total (Q&amp;A + Creative Costume)
                  </span>
                  <span className="print-only">Morning</span>
                </th>
                <th className="border px-2 py-1 text-right whitespace-nowrap">
                  <span className="screen-only">
                    Coronation Total (Swimwear + Evening Wear)
                  </span>
                  <span className="print-only">Coronation</span>
                </th>
                <th className="border px-2 py-1 text-right">Combined</th>
                <th className="border px-2 py-1 text-left">Rank</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const combined =
                  r.combinedTotal ??
                  (r.morningWeightedTotal != null &&
                  r.coronationWeightedTotal != null
                    ? r.morningWeightedTotal + r.coronationWeightedTotal
                    : null);
                return (
                  <tr key={`tally-${r.candidateId}`}>
                    <td className="border px-2 py-1">{r.candidateId}</td>
                    <td className="border px-2 py-1">{r.candidateName}</td>
                    <td className="border px-2 py-1 text-right">
                      {r.morningWeightedTotal != null
                        ? r.morningWeightedTotal.toFixed(2)
                        : "—"}
                    </td>
                    <td className="border px-2 py-1 text-right">
                      {r.coronationWeightedTotal != null
                        ? r.coronationWeightedTotal.toFixed(2)
                        : "—"}
                    </td>
                    <td className="border px-2 py-1 text-right font-semibold">
                      {combined != null ? combined.toFixed(2) : "—"}
                    </td>
                    <td
                      className={cn(
                        r.finalRank != null && r.finalRank <= 7
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
      </section>
    </div>
  );
}
