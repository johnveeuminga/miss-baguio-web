import { useEffect, useState } from "react";
import { get } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import type { CandidateCombinedResultDto, ResultsMode } from "./types";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

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
      <div className="printable">
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
  const maxEvening = eveningJudges.length;
  const maxSwimsuit = swimsuitJudges.length;

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

  return (
    <div className="overflow-auto printable">
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
                Evening Wear
              </th>
            )}
            {maxSwimsuit > 0 && (
              <th
                className="border px-2 py-1 text-left"
                colSpan={maxSwimsuit + 2}
              >
                Swimwear
              </th>
            )}
            {/* rowSpan spans both header rows so these three labels appear
                once, not stacked on top of a second, identically-named row
                below (was "Morning Total" over "Morning", "Rank" over
                "Rank", etc.) */}
            <th className="border px-2 py-1 text-left" rowSpan={2}>
              Morning Total (Q&amp;A + Creative Costume)
            </th>
            <th className="border px-2 py-1 text-left" rowSpan={2}>
              Coronation Total (Swimwear + Evening Wear)
            </th>
            <th className="border px-2 py-1 text-left" rowSpan={2}>
              Rank
            </th>
          </tr>
          <tr>
            <th className="border px-2 py-1 text-left">No</th>
            <th className="border px-2 py-1 text-left">Name</th>
            {eveningJudges.map((j, i) => (
              <th
                key={`eg-j${j.judgeId}-${i}`}
                className="border px-2 py-1 text-left whitespace-nowrap"
              >
                {j.judgeName || `J${i + 1}`}
              </th>
            ))}
            {maxEvening > 0 && (
              <>
                <th className="border px-2 py-1 text-left">Avg</th>
                <th className="border px-2 py-1 text-left">W</th>
              </>
            )}
            {swimsuitJudges.map((j, i) => (
              <th
                key={`sw-j${j.judgeId}-${i}`}
                className="border px-2 py-1 text-left whitespace-nowrap"
              >
                {j.judgeName || `J${i + 1}`}
              </th>
            ))}
            {maxSwimsuit > 0 && (
              <>
                <th className="border px-2 py-1 text-left">Avg</th>
                <th className="border px-2 py-1 text-left">W</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const eg = r.coronationCategories?.find(
              (c) => c.categoryName === "Evening Wear"
            );
            const sw = r.coronationCategories?.find(
              (c) => c.categoryName === "Swimwear"
            );
            return (
              <tr key={r.candidateId}>
                <td className="border px-2 py-1">{r.candidateId}</td>
                <td className="border px-2 py-1">{r.candidateName}</td>
                {eveningJudges.map((j, idx) => {
                  const cell =
                    eg?.judgeScores?.find((js) => js.judgeId === j.judgeId) ??
                    eg?.judgeScores?.[idx];
                  return (
                    <td
                      key={`eg-${r.candidateId}-${j.judgeId}-${idx}`}
                      className="border px-2 py-1 text-right"
                    >
                      {cell && cell.score != null ? cell.score.toFixed(2) : "—"}
                    </td>
                  );
                })}
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
                {swimsuitJudges.map((j, idx) => {
                  const cell =
                    sw?.judgeScores?.find((js) => js.judgeId === j.judgeId) ??
                    sw?.judgeScores?.[idx];
                  return (
                    <td
                      key={`sw-${r.candidateId}-${j.judgeId}-${idx}`}
                      className="border px-2 py-1 text-right"
                    >
                      {cell && cell.score != null ? cell.score.toFixed(2) : "—"}
                    </td>
                  );
                })}
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
                  {r.morningWeightedTotal != null
                    ? r.morningWeightedTotal.toFixed(2)
                    : "—"}
                </td>
                <td className="border px-2 py-1 text-right">
                  {r.coronationWeightedTotal != null
                    ? r.coronationWeightedTotal.toFixed(2)
                    : "—"}
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
  );
}
