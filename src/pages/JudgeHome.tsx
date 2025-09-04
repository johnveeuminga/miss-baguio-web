import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function JudgeHome() {
  const navigate = useNavigate();

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Hello, Judge</h1>
      <div className="flex gap-3 mb-6">
        <Button onClick={() => navigate("/finals-scoring")} variant="default">
          Finals
        </Button>
        <Button
          onClick={() => navigate("/scoring?category=top5")}
          variant="secondary"
        >
          Top 5
        </Button>
        <Button
          onClick={() => navigate("/scoring?category=presentation")}
          variant="outline"
        >
          Presentation
        </Button>
      </div>
    </div>
  );
}
