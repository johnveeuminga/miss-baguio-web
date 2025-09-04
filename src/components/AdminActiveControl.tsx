import { useState } from "react";
import { post } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

export default function AdminActiveControl() {
  const token = useAuthStore((s) => s.token);
  const [candidateId, setCandidateId] = useState<number | "">("");

  async function submit() {
    await post(
      "/api/active-candidate",
      { candidateId: candidateId || null },
      token ?? undefined
    );
    // simple, no optimistic UI
  }

  return (
    <div className="p-4 bg-[var(--card)] rounded">
      <h3 className="font-semibold mb-2">Admin Active Control</h3>
      <input
        type="number"
        value={String(candidateId)}
        onChange={(e) => setCandidateId(Number(e.target.value) || "")}
        className="mb-2"
      />
      <button onClick={submit} className="px-3 py-1 bg-[var(--gold)] rounded">
        Set Active
      </button>
    </div>
  );
}
