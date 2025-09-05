import { useEffect, useState } from "react";
import { get } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import type { Top5Dto } from "./types";

export default function Top5CandidatesTable() {
  const token = useAuthStore((s) => s.token);
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<Top5Dto[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const res = (await get(
          "/api/scoring/top5-candidates",
          token ?? undefined
        )) as Top5Dto[];
        if (!mounted) return;
        setCandidates(res ?? []);
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

  if (loading) return <div>Loading Top 5 candidates…</div>;
  if (!loading && candidates.length === 0)
    return <div>No Top 5 candidates</div>;

  return (
    <div className="overflow-auto printable">
      <div className="italic mb-2">*IN NO PARTICULAR ORDER</div>
      <table
        className="min-w-full border-collapse table-auto"
        style={{ borderColor: "#000" }}
      >
        <thead>
          <tr>
            <th className="border px-2 py-1 text-left">No</th>
            <th className="border px-2 py-1 text-left">Candidate</th>
            <th className="border px-2 py-1 text-left">Barangay</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((c) => (
            <tr key={c.candidateId}>
              <td className="border px-2 py-1">{c.candidateId}</td>
              <td className="border px-2 py-1">{c.candidateName}</td>
              <td className="border px-2 py-1">{c.barangay}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
