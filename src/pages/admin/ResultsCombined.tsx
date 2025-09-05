import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import MissBaguioResultsTable from "./MissBaguioResultsTable";
import CombinedResultsTable from "./CombinedResultsTable";
import Top5ResultsTable from "./Top5ResultsTable";
import Top5CandidatesTable from "./Top5CandidatesTable";
import SpecialAwardsTable from "./SpecialAwardsTable";

export default function ResultsCombined() {
  const [view, setView] = useState<
    "combined" | "top5" | "top5-candidates" | "miss-baguio" | "special-awards"
  >("combined");

  function handlePrint() {
    window.print();
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Results — Admin</h1>
        <div className="flex items-center gap-3">
          <Select
            value={view}
            onValueChange={(v: string) =>
              setView(
                v as
                  | "combined"
                  | "top5"
                  | "top5-candidates"
                  | "miss-baguio"
                  | "special-awards"
              )
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="combined">
                Combined (Prelim + Finals)
              </SelectItem>
              <SelectItem value="top5">Top 5</SelectItem>
              <SelectItem value="top5-candidates">Top 5 Candidates</SelectItem>
              <SelectItem value="miss-baguio">Miss Baguio Results</SelectItem>
              <SelectItem value="special-awards">Special Awards</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handlePrint}>Print</Button>
        </div>
      </div>

      <Card>
        <CardHeader className="font-bold">
          {view === "combined"
            ? "Combined Results"
            : view === "top5"
            ? "Top 5 Results"
            : view === "miss-baguio"
            ? "Miss Baguio Results"
            : view === "special-awards"
            ? "Special Awards"
            : "Top 5 Candidates"}
        </CardHeader>
        <CardContent>
          {view === "combined" ? (
            <CombinedResultsTable />
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

      <style>{`@media print { body * { visibility: hidden; } .printable, .printable * { visibility: visible; } .printable { position: absolute; left: 0; top: 0; width: 100%; } table { border: 1px solid #000; border-collapse: collapse; } th, td { border: 1px solid #000 !important; color: #000 !important; } }`}</style>
    </div>
  );
}
