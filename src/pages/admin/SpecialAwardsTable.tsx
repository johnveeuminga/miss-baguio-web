import { useEffect, useState } from "react";
import { get } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

type AwardDto = {
  award: {
    id: number;
    name: string;
    description?: string | null;
    winnerCandidateId?: number | null;
    winnerCandidateName?: string | null;
    calculationMethod?: string | null;
    isScoreBased?: boolean;
    createdAt?: string;
    updatedAt?: string;
  };
  candidate?: {
    id: number;
    name: string;
    barangay?: string | null;
    photoUrl?: string | null;
    bio?: string | null;
    featured?: boolean;
    votes?: number;
    isPeoplesChoice?: boolean;
    createdAt?: string;
    updatedAt?: string;
  } | null;
};

export default function SpecialAwardsTable() {
  const token = useAuthStore((s) => s.token);
  const [loading, setLoading] = useState(false);
  const [awards, setAwards] = useState<AwardDto[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const res = (await get(
          "/api/admin/special-awards",
          token ?? undefined
        )) as AwardDto[];
        if (!mounted) return;
        setAwards(res ?? []);
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

  if (loading) return <div>Loading special awards…</div>;
  if (!loading && awards.length === 0) return <div>No special awards</div>;

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
          {awards.map((a) => (
            <tr key={a.award.id}>
              <td className="border px-2 py-1">{a.award.winnerCandidateId}</td>
              <td className="border px-2 py-1">
                {a.candidate?.name ?? a.award.winnerCandidateName ?? "—"}
              </td>
              <td className="border px-2 py-1">{a.candidate?.barangay}</td>
              <td className="border px-2 py-1 font-bold">{a.award.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
