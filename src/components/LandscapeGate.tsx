import React, { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";

/**
 * Judges score on tablets that are always meant to be held in landscape —
 * the scoring grid and the Top 7 ranking board are laid out for a wide
 * viewport and get cramped/unusable in portrait (7 stacked slots push the
 * candidate list far below the fold). Rather than maintain a second
 * portrait layout for every judge screen, we hard-block portrait: this
 * shows a full-screen "rotate your device" prompt and hides the children
 * until the device is wide again. A web app can't force orientation, so
 * this is the reliable way to guarantee the landscape layout is the only
 * one a judge ever interacts with.
 *
 * Uses a width/height check rather than the Screen Orientation API so it
 * also does the right thing on a desktop browser window that happens to
 * be taller than it is wide (just resize it wider). The 640px floor means
 * a genuinely small landscape phone still gets the prompt — those aren't
 * supported scoring devices.
 */
function isPortraitOrTooNarrow(): boolean {
  if (typeof window === "undefined") return false;
  const w = window.innerWidth;
  const h = window.innerHeight;
  return h > w || w < 640;
}

export default function LandscapeGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const [blocked, setBlocked] = useState(isPortraitOrTooNarrow());

  useEffect(() => {
    const update = () => setBlocked(isPortraitOrTooNarrow());
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  if (blocked) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background p-8 text-center">
        <RotateCcw className="size-12 text-primary" />
        <h1 className="text-xl font-bold">Please rotate your device</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          The scoring screens are designed for landscape. Turn your tablet
          sideways to continue.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
