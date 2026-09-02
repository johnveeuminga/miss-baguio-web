import { useEffect, useState, useRef } from "react";
import { get, post } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { LoadingView, EmptyView, ErrorView } from "@/components/ui/status-view";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  TouchSensor,
  MouseSensor,
  PointerSensor,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";

type CandidateResultDto = {
  candidateId: number;
  candidateName: string;
  photoUrl?: string | null;
  isPeoplesChoice?: boolean;
  number?: number | null;
  barangay?: string | null;
};

type RankingDto = {
  candidateId: number;
  rankPosition: number;
  candidateName?: string | null;
  photoUrl?: string | null;
  barangay?: string | null;
};

// Miss Baguio 2026 "Road to Top 7" — 6 finalists by combined score + the
// People's Choice winner (7th slot, backfilled to next-highest score if
// she already placed in the top 6 on her own merit — see the API's
// GetTop5Candidates/SelectTop7WithPeoplesChoice for the selection logic).
const TOP_N = 7;

export default function Top7Ranking() {
  const token = useAuthStore((s) => s.token);
  // navigate is intentionally unused in this page
  const [candidates, setCandidates] = useState<CandidateResultDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [locked] = useState(false);
  const [slots, setSlots] = useState<(CandidateResultDto | null)[]>(
    Array.from({ length: TOP_N }, () => null)
  );
  const [isAlreadySubmitted, setIsAlreadySubmitted] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeWidth, setActiveWidth] = useState<number | null>(null);
  const bodyOverflowRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      // restore body overflow if component unmounts while dragging
      if (bodyOverflowRef.current !== null) {
        document.body.style.overflow = bodyOverflowRef.current;
        bodyOverflowRef.current = null;
      }
    };
  }, []);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const [list, ranking] = (await Promise.all([
        get("/api/scoring/top5-candidates", token ?? undefined),
        get("/api/scoring/rankings/me", token ?? undefined),
      ])) as [
        CandidateResultDto[] | null | undefined,
        RankingDto[] | null | undefined
      ];

      const candidatesList = list ?? [];
      const rankingList = ranking ?? [];

      const nextSlots: (CandidateResultDto | null)[] = Array.from(
        { length: TOP_N },
        () => null
      );
      const assigned = new Set<number>();
      for (const r of rankingList) {
        if (!r) continue;
        const pos = Number(r.rankPosition);
        if (Number.isNaN(pos) || pos < 1 || pos > TOP_N) continue;
        const found =
          candidatesList.find((c) => c.candidateId === r.candidateId) ?? null;
        const cand: CandidateResultDto =
          found ??
          ({
            candidateId: r.candidateId,
            candidateName: r.candidateName ?? `#${r.candidateId}`,
            photoUrl: r.photoUrl ?? null,
            barangay: r.barangay ?? null,
          } as CandidateResultDto);
        nextSlots[pos - 1] = cand;
        assigned.add(r.candidateId);
      }

      setIsAlreadySubmitted(rankingList.length === TOP_N);

      const available = candidatesList.filter(
        (c) => !assigned.has(c.candidateId)
      );

      setCandidates(available);
      setSlots(nextSlots);
    } catch (e) {
      console.error(e);
      setLoadError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // TODO(2026 Top 7): placements 4-7 aren't confirmed with the Executive
  // Committee yet (last year's format only went to 5th/Malikhain). Mirrors
  // the placeholder titles in the API's GetTitleForRank — update both when
  // the real titles are confirmed.
  const AWARD_TITLES = [
    "MISS BAGUIO 2026",
    "MISS BAGUIO TURISMO 2026",
    "MISS BAGUIO KALIKASAN 2026",
    "4TH RUNNER-UP", // TODO: confirm real title
    "5TH RUNNER-UP", // TODO: confirm real title
    "6TH RUNNER-UP", // TODO: confirm real title
    "7TH RUNNER-UP", // TODO: confirm real title
  ];

  function removeFromSlot(index: number) {
    const next = [...slots];
    const removed = next[index];
    next[index] = null;
    setSlots(next);
    // when manually removing from a slot, return the candidate to the available list
    if (removed) {
      setCandidates((prev) => [removed!, ...prev]);
    }
  }

  function findCandidateByActiveId(id: string | null) {
    if (!id) return null;
    if (!id.startsWith("cand-")) return null;
    const cid = parseInt(id.split("-")[1], 10);
    return candidates.find((c) => c.candidateId === cid) ?? null;
  }

  // Draggable candidate card (compact) — used within the candidate strip
  function CandidateCardCompact({ c }: { c: CandidateResultDto }) {
    const id = `cand-${c.candidateId}`;
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
      id,
    });
    const isActive = activeId === id;
    const style = isActive
      ? { opacity: 0, touchAction: "none" }
      : transform
      ? {
          transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
          touchAction: "none",
        }
      : { touchAction: "none" };

    return (
      <div
        data-draggable={id}
        ref={setNodeRef as unknown as (el: HTMLElement | null) => void}
        {...attributes}
        {...listeners}
        style={style}
        className={`flex-shrink-0 box-border border-2 dark:border-neutral-700 rounded-md bg-card ${
          isActive ? "" : "transition-transform duration-75 ease-linear"
        } mr-3`}
      >
        <CardContent className="box-border h-full flex flex-col">
          <div className="w-full relative overflow-hidden rounded mb-2 bg-card flex items-center justify-center">
            <img
              src={c.photoUrl ?? ""}
              alt={c.candidateName}
              className="max-w-full max-h-full object-contain object-center"
            />
          </div>
          <div className="text-sm text-muted-foreground flex-1">
            <div className="text-lg font-semibold text-card-foreground">
              {c.candidateName}
            </div>
            <div className="text-xs text-muted-foreground">
              #{c.candidateId} • {c.barangay ?? "—"}
            </div>
          </div>
        </CardContent>
      </div>
    );
  }

  // Full card used for DragOverlay and for filled slots
  function CandidateCardFull({
    c,
    onRemove,
  }: {
    c: CandidateResultDto;
    onRemove?: () => void;
  }) {
    return (
      <Card className="w-full">
        <CardContent className="p-3 box-border flex flex-col">
          <div className="w-full h-44 relative overflow-hidden rounded mb-3 bg-card flex items-center justify-center">
            <img
              src={c.photoUrl ?? ""}
              alt={c.candidateName}
              className="max-w-full max-h-full object-contain object-center"
            />
          </div>
          <div className="flex-1">
            <div className="text-xl font-semibold">{c.candidateName}</div>
            <div className="text-sm text-muted-foreground">
              #{c.candidateId} • {c.barangay ?? "—"}
            </div>
          </div>
          <div className="mt-3">
            {onRemove ? (
              <Button variant="outline" onClick={onRemove} className="w-full">
                Remove
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Slot component renders full card when filled
  function Slot({ index }: { index: number }) {
    const id = `slot-${index}`;
    const { isOver, setNodeRef } = useDroppable({ id });
    const s = slots[index];
    const paddingClass = s ? "p-0 border-0" : "p-2 border";

    return (
      <div
        ref={setNodeRef as unknown as (el: HTMLElement | null) => void}
        className={`${paddingClass} rounded-md bg-card min-h-40 flex items-center justify-center ${
          isOver ? "ring-2 ring-green-400" : ""
        }`}
      >
        {s ? (
          <div className="w-full">
            <CandidateCardFull c={s} onRemove={() => removeFromSlot(index)} />
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Drop here</div>
        )}
      </div>
    );
  }

  // configure sensors: TouchSensor with a short activation delay, plus MouseSensor
  const sensors = useSensors(
    useSensor(TouchSensor, {
      activationConstraint: { delay: 100, tolerance: 5 },
    }),
    useSensor(MouseSensor),
    useSensor(PointerSensor)
  );

  const canSubmit =
    slots.every((s) => s !== null) && !locked && !isAlreadySubmitted;
  async function submit() {
    if (!canSubmit || !token) return false;
    const body = slots.map((s, idx) => ({
      candidateId: s!.candidateId,
      rankPosition: idx + 1,
    }));
    try {
      await post(
        "/api/scoring/rankings",
        body as unknown as Record<string, unknown>,
        token
      );
      toast.success("Top 7 submitted");
      // mark as submitted so submit stays disabled
      setIsAlreadySubmitted(true);
      return true;
    } catch (e) {
      console.error(e);
      toast.error("Submit failed");
      return false;
    }
  }

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleConfirmSubmit() {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const ok = await submit();
      setIsSubmitting(false);
      if (ok) {
        setConfirmOpen(false);
      } else {
        setSubmitError("Submission failed");
      }
    } catch (err) {
      console.error(err);
      setSubmitError(err instanceof Error ? err.message : String(err));
      setIsSubmitting(false);
    }
  }

  // Keep candidate strip at a fixed number of visible columns
  const DISPLAY_COLUMNS = TOP_N;
  const displayedCandidates = Array.from({ length: DISPLAY_COLUMNS }).map(
    (_, i) => candidates[i] ?? null
  );

  if (loadError) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Top 7 Ranking</h1>
        <ErrorView
          title="Couldn't load Top 7 candidates"
          description={loadError}
          onRetry={load}
        />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Top 7 Ranking</h1>
        <div className="text-sm text-muted-foreground">
          {locked ? "Locked" : "Open"}
        </div>
      </div>

      <DndContext
        sensors={sensors}
        autoScroll={false}
        onDragStart={(e: DragStartEvent) => {
          const id = e.active.id?.toString() ?? null;
          setActiveId(id);
          if (id) {
            const el = document.querySelector(
              `[data-draggable="${id}"]`
            ) as HTMLElement | null;
            if (el) {
              const rect = el.getBoundingClientRect();
              setActiveWidth(Math.round(rect.width));
            } else {
              setActiveWidth(null);
            }
          } else {
            setActiveWidth(null);
          }
          // disable page scroll while dragging
          try {
            bodyOverflowRef.current = document.body.style.overflow ?? null;
            document.body.style.overflow = "hidden";
          } catch {
            /* ignore */
          }
        }}
        onDragEnd={(event: DragEndEvent) => {
          const { active, over } = event;
          setActiveId(null);
          setActiveWidth(null);
          // restore page scroll
          try {
            if (bodyOverflowRef.current !== null) {
              document.body.style.overflow = bodyOverflowRef.current;
            } else {
              document.body.style.overflow = "";
            }
            bodyOverflowRef.current = null;
          } catch {
            /* ignore */
          }
          if (!over) return;
          const activeIdStr = active.id?.toString();
          const overId = over.id?.toString();
          if (!activeIdStr || !overId) return;

          if (overId.startsWith("slot-") && activeIdStr.startsWith("cand-")) {
            const slotIndex = parseInt(overId.split("-")[1], 10);
            const candId = parseInt(activeIdStr.split("-")[1], 10);
            // Find candidate either in the available list or in existing slots
            const candInAvailable =
              candidates.find((c) => c.candidateId === candId) ?? null;
            const next = [...slots];
            const existingIndex = next.findIndex(
              (s) => s?.candidateId === candId
            );
            // If it existed in another slot, remove it from there
            if (existingIndex !== -1) next[existingIndex] = null;

            // Capture whoever is currently occupying the target slot (if any)
            const replaced = next[slotIndex];

            // Determine candidate object: prefer available list match, otherwise search previous slots
            const cand =
              candInAvailable ??
              (existingIndex !== -1 ? slots[existingIndex] ?? null : null);
            if (!cand) return;

            // Place the new candidate into the slot
            next[slotIndex] = cand;
            setSlots(next);

            // If the candidate was taken from the available list (not moved between slots), remove it from available candidates
            if (candInAvailable) {
              setCandidates((prev) =>
                prev.filter((p) => p.candidateId !== candId)
              );
            }

            // If we replaced an existing candidate (different from the one just placed), return them to the available list
            if (replaced && replaced.candidateId !== cand.candidateId) {
              setCandidates((prev) => [replaced, ...prev]);
            }
          }
        }}
        onDragCancel={() => {
          setActiveId(null);
          setActiveWidth(null);
          try {
            if (bodyOverflowRef.current !== null) {
              document.body.style.overflow = bodyOverflowRef.current;
            } else {
              document.body.style.overflow = "";
            }
            bodyOverflowRef.current = null;
          } catch {
            /* ignore */
          }
        }}
      >
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {slots.map((_, i) => (
              <div key={i} className="border-2 rounded-md bg-card p-4">
                <div className="mb-2">
                  <div className="font-bold text-center">
                    {AWARD_TITLES[i] ?? "Placement"}
                  </div>
                </div>
                <Slot index={i} />
              </div>
            ))}
          </div>

          <Card>
            <CardHeader className="font-bold">Candidates</CardHeader>
            <CardContent className="h-full overflow-hidden ">
              <div className="overflow-x-auto py-2">
                {loading ? (
                  <LoadingView label="Loading candidates…" />
                ) : candidates.length === 0 ? (
                  <EmptyView
                    title="No candidates left to place"
                    description={
                      isAlreadySubmitted
                        ? "You've already submitted your Top 7 ranking."
                        : "All candidates have been placed into a slot above."
                    }
                  />
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
                    {displayedCandidates.map((c, idx) => (
                      <div
                        key={c ? `cand-${c.candidateId}` : `empty-${idx}`}
                        className="w-full"
                      >
                        {c ? (
                          <CandidateCardCompact c={c} />
                        ) : (
                          <div className="box-border border-2 border-dashed rounded-md bg-card/30 h-full p-3 flex flex-col items-center justify-center text-sm text-muted-foreground">
                            <div className="text-xs">Empty</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={!canSubmit}
              className="w-full max-w-xs"
            >
              {isAlreadySubmitted ? "Submitted" : "Submit Top 7"}
            </Button>
          </div>

          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm submission</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to submit the Top 7 rankings? This
                  action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                {submitError && (
                  <div className="text-sm text-destructive mb-3">
                    {submitError}
                  </div>
                )}
                <div className="flex gap-3 justify-end">
                  <AlertDialogCancel
                    onClick={() => setConfirmOpen(false)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </AlertDialogCancel>
                  <Button onClick={handleConfirmSubmit} disabled={isSubmitting}>
                    {isSubmitting ? "Submitting..." : "Confirm"}
                  </Button>
                </div>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <DragOverlay
          dropAnimation={{ duration: 75, easing: "linear" }}
          adjustScale={false}
        >
          {activeId ? (
            findCandidateByActiveId(activeId) ? (
              <div
                style={activeWidth ? { width: `${activeWidth}px` } : undefined}
                className="w-auto"
              >
                <CandidateCardFull c={findCandidateByActiveId(activeId)!} />
              </div>
            ) : null
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
