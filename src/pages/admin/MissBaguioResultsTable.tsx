import { useEffect, useState } from "react";
import { get } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import type { Top5Dto } from "./types";

export default function MissBaguioResultsTable() {
  const token = useAuthStore((s) => s.token);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Top5Dto[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const res = (await get(
          "/api/admin/results/top5",
          token ?? undefined
        )) as Top5Dto[];
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

  if (loading) return <div>Loading Miss Baguio results…</div>;
  if (!loading && results.length === 0)
    return <div>No Miss Baguio results</div>;

  const sorted = [...results].sort(
    (a, b) => (a.finalRank ?? 0) - (b.finalRank ?? 0)
  );

  return (
    <div className="overflow-auto printable">
      <table
        className="min-w-full border-collapse table-auto"
        style={{ borderColor: "#000" }}
      >
        <thead>
          <tr>
            <th className="border px-2 py-1 text-left">No</th>
            <th className="border px-2 py-1 text-left">Candidate</th>
            <th className="border px-2 py-1 text-left">Barangay</th>
            <th className="border px-2 py-1 text-left">Award</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => {
            return (
              <tr key={c.candidateId}>
                <td className="border px-2 py-1">{c.candidateId}</td>
                <td className="border px-2 py-1">{c.candidateName}</td>
                <td className="border px-2 py-1">{c.barangay}</td>
                <td className="border px-2 py-1 font-bold">{c.title}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
