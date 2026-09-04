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

      <style>{`@media print { body * { visibility: hidden; } .printable, .printable * { visibility: visible; } .printable { position: absolute; left: 0; top: 0; width: 100%; } table { border: 1px solid #000; border-collapse: collapse; } th, td { border: 1px solid #000 !important; color: #000 !important; } thead { display: table-header-group; } .printable section { break-inside: avoid; } .printable section + section { margin-top: 1.5rem; } }`}</style>
    </div>
  );
}
