import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Viewer() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Viewer Dashboard</h1>

      <div className="max-w-md">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground mb-4">
              Use the live scoreboard to watch submitted scores in realtime.
              Open the scoreboard below.
            </p>

            <Link to="/viewer/scoreboard">
              <Button className="w-full">Open Live Scoreboard</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
