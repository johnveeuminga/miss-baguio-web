import { useEffect, useState } from "react";
import { get } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import type { CandidateCombinedResultDto } from "./types";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

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
        r.coronationCategories?.find((c) => c.categoryName === "Evening Wear")
          ?.judgeScores?.length ?? 0
    )
  );
  const maxSwimsuit = Math.max(
    0,
    ...sorted.map(
      (r) =>
        r.coronationCategories?.find((c) => c.categoryName === "Swimwear")
          ?.judgeScores?.length ?? 0
    )
  );

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
            scored in every category yet (e.g. Morning Session done but
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
