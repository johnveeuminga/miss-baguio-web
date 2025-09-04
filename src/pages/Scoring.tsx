import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { post, get } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

export default function Scoring() {
  const token = useAuthStore((s) => s.token);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const qc = useQueryClient();

  async function submit() {
    setSubmitting(true);
    try {
      // minimal example; in real app fetch active candidate first
      const active = await get("/api/active-candidate", token ?? undefined);
      const candidateId = active?.candidate?.id;
      if (!candidateId) throw new Error("No active candidate");
      await post(
        "/api/scores",
        { candidateId, scores, comment },
        token ?? undefined
      );
      // refresh
      qc.invalidateQueries({ queryKey: ["scores", candidateId] });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Scoring</h1>
      <Card>
        <CardContent>
          <div className="mb-4">
            Criteria (mock): Ramp Walk, Poise, Presentation
          </div>
          <div className="space-y-2 mb-4">
            <Input
              placeholder="Ramp Walk"
              type="number"
              onChange={(e) =>
                setScores((s) => ({ ...s, ramp: Number(e.target.value) }))
              }
            />
            <Input
              placeholder="Poise"
              type="number"
              onChange={(e) =>
                setScores((s) => ({ ...s, poise: Number(e.target.value) }))
              }
            />
            <Input
              placeholder="Presentation"
              type="number"
              onChange={(e) =>
                setScores((s) => ({ ...s, pres: Number(e.target.value) }))
              }
            />
          </div>
          <Textarea
            placeholder="Comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="mb-4"
          />
          <Button variant="default" onClick={submit} disabled={submitting}>
            {submitting ? "Submitting..." : "Submit Score"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
