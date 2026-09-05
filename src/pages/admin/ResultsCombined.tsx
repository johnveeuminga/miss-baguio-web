import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Printer } from "lucide-react";
import MissBaguioResultsTable from "./MissBaguioResultsTable";
import CombinedResultsTable from "./CombinedResultsTable";
import PreliminaryResultsTable from "./PreliminaryResultsTable";
import Top5ResultsTable from "./Top5ResultsTable";
import Top5CandidatesTable from "./Top5CandidatesTable";
import SpecialAwardsTable from "./SpecialAwardsTable";
import type { ResultsMode } from "./types";

// 2026 "Road to Top 7" naming — these views used to be labeled for the old
// Preliminary/Finals + Top 5 format. The underlying endpoints/data are
// already on the new model (verified: /api/admin/results/prelims-finals
// now returns Morning/Coronation category names, /api/admin/results/top5
// returns 7 finalists), the labels just hadn't been updated to match.
const VIEWS = [
  {
    id: "combined",
    label: "All Scores",
    description: "Every candidate's Morning + Coronation Night scores.",
  },
  {
    id: "preliminary",
    label: "Preliminaries Tally",
    description:
      "Q&A + Creative Costume only — reviewable right after Preliminaries wraps, before Coronation Night starts.",
  },
  {
    id: "top5",
    label: "Top 7 — Per-Judge Ranks",
    description: "Final placements with each judge's individual rank.",
  },
  {
    id: "top5-candidates",
    label: "Top 7 Finalists",
    description: "The 7 finalists, unordered.",
  },
  {
    id: "miss-baguio",
    label: "Final Titles",
    description: "Miss Baguio, runners-up, and the rest of Top 7.",
  },
  {
    id: "special-awards",
    label: "Special Awards",
    description: "Best in Evening Wear, Swimwear, Creative Costume, People's Choice.",
  },
] as const;

type ViewId = (typeof VIEWS)[number]["id"];

// Which views actually change between Detailed and Announce. The Top 7 /
// Final Titles / Special Awards tables are already just placement lists —
// nothing to strip — so the toggle is hidden while they're selected.
const MODE_AWARE_VIEWS: ReadonlySet<ViewId> = new Set(["combined", "preliminary"]);

// Which views need landscape on print. Combined/Preliminary Detailed are
// the classic case, but "Top 7 — Per-Judge Ranks" is just as wide — 5 fixed
// columns plus one per judge, up to 9 — even though it has no Detailed/
// Announce toggle. Everything else (Final Titles, Top 7 Finalists, Special
// Awards) is a narrow 3-4 column placement list that's fine in portrait.
const LANDSCAPE_VIEWS: ReadonlySet<ViewId> = new Set(["combined", "preliminary", "top5"]);

export default function ResultsCombined() {
  const [view, setView] = useState<ViewId>("combined");
  const [mode, setMode] = useState<ResultsMode>("detailed");
  const activeView = VIEWS.find((v) => v.id === view)!;
  const modeApplies = MODE_AWARE_VIEWS.has(view);

  function handlePrint() {
    window.print();
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            to="/admin/active"
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground inline-flex items-center gap-1 mb-1"
          >
            <ChevronLeft className="size-3" /> Back to session control
          </Link>
          <h1 className="text-xl font-bold">Results</h1>
        </div>
        <div className="flex items-center gap-2">
          {modeApplies && (
            // Detailed = tabulation committee (judge columns + 20/20
            // weighting, for auditing). Announce = host/emcee (rank + name
            // + total only, nothing to decode on air). Print follows
            // whichever is active.
            <div className="inline-flex rounded-md border p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setMode("detailed")}
                className={
                  "px-2.5 py-1 rounded-sm font-medium transition-colors " +
                  (mode === "detailed"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                Detailed
              </button>
              <button
                type="button"
                onClick={() => setMode("announce")}
                className={
                  "px-2.5 py-1 rounded-sm font-medium transition-colors " +
                  (mode === "announce"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                Announce
              </button>
            </div>
          )}
          <Button onClick={handlePrint} variant="outline" size="sm">
            <Printer className="size-4" /> Print
          </Button>
        </div>
      </div>

      {/* Tabs instead of a dropdown — with only 6 views, a row of buttons
          is faster to scan and switch between than opening a select each
          time, and shows all the options at once instead of hiding them
          behind a closed trigger. */}
      <div className="flex flex-wrap gap-1.5">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setView(v.id)}
            className={
              "px-3 py-1.5 rounded-md text-sm font-medium transition-colors " +
              (view === v.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground")
            }
          >
            {v.label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          <p className="text-xs text-muted-foreground mb-3">
            {activeView.description}
            {modeApplies && mode === "announce"
              ? " — Announce view: placements only, for the host."
              : ""}
          </p>
          {view === "combined" ? (
            <CombinedResultsTable mode={mode} />
          ) : view === "preliminary" ? (
            <PreliminaryResultsTable mode={mode} />
          ) : view === "top5" ? (
            <Top5ResultsTable />
          ) : view === "miss-baguio" ? (
            <MissBaguioResultsTable />
          ) : view === "special-awards" ? (
            <SpecialAwardsTable />
          ) : (
            <Top5CandidatesTable />
          )}
        </CardContent>
      </Card>

      {/* Print rules. Both Detailed views (Preliminaries and Combined) are
          now stacked per-category scoresheets — No/Name + a column per
          judge + Avg + W, ~13 columns at a 9-judge panel — rather than one
          wide side-by-side grid. That keeps every sheet legible at the same
          print size regardless of how many judges are seated; a single wide
          table only fit a full 9-judge Combined sheet by shrinking to ~7px,
          which nobody could actually read off a printed page. Landscape
          still gives more breathing room than portrait, so Detailed keeps
          it. Announce stays portrait: 5 columns, read at arm's length by
          the emcee, wants big type. Scoped via .printable[data-print-mode]
          rather than a blanket @page so the two modes can't drag each other
          around. */}
      <style>{`@media print { body * { visibility: hidden; } .printable, .printable * { visibility: visible; } .printable { position: absolute; left: 0; top: 0; width: 100%; } table { border: 1px solid #000; border-collapse: collapse; } th, td { border: 1px solid #000 !important; color: #000 !important; } thead { display: table-header-group; } .printable section { break-inside: avoid; } .printable section + section { margin-top: 1.5rem; } }
@media print { .printable[data-print-mode="detailed"] table { width: 100%; max-width: 100%; min-width: 0 !important; table-layout: auto; font-size: 10px; } .printable[data-print-mode="detailed"] th, .printable[data-print-mode="detailed"] td { padding: 1px 4px; word-break: normal; } .printable[data-print-mode="detailed"] thead th { white-space: normal !important; overflow-wrap: anywhere; line-height: 1.15; } .printable[data-print-mode="detailed"] tbody td:nth-child(2) { white-space: nowrap; } }
@media print { .printable[data-print-mode="announce"] { font-size: 13px; } }
/* Swap long on-screen header labels for short printed ones. display (not
   visibility) so the hidden variant takes up no width at all — the whole
   point is to stop those two columns from eating the page. */
.print-only { display: none; }
@media print { .screen-only { display: none !important; } .print-only { display: inline !important; } }`}</style>
      {/* Wide, judge-per-column views need landscape; narrow placement
          lists (and Announce mode, which strips those columns back down)
          stay portrait. @page can't be conditioned on a selector, so the
          size is swapped by injecting the rule that matches whatever's
          actually being printed. */}
      {LANDSCAPE_VIEWS.has(view) && !(modeApplies && mode === "announce") ? (
        <style>{`@page { size: A4 landscape; margin: 8mm; }`}</style>
      ) : (
        <style>{`@page { size: A4 portrait; margin: 10mm; }`}</style>
      )}
    </div>
  );
}
