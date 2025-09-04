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
import { useNavigate } from "react-router-dom";
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

export default function Top5Ranking() {
  const token = useAuthStore((s) => s.token);
  const navigate = useNavigate();
  const [candidates, setCandidates] = useState<CandidateResultDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [locked] = useState(false);
  const [slots, setSlots] = useState<(CandidateResultDto | null)[]>([
    null,
    null,
    null,
    null,
    null,
  ]);
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

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const list = (await get(
          "/api/scoring/top5-candidates",
          token ?? undefined
        )) as CandidateResultDto[];
        if (!mounted) return;
        setCandidates(list ?? []);
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

  const AWARD_TITLES = [
    "MISS BAGUIO 2025",
    "MISS BAGUIO TURISMO 2025",
    "MISS BAGUIO KALIKASAN 2025",
    "MISS BAGUIO KULTURA 2025",
    "MISS BAGUIO MALIKHAIN 2025",
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

  const canSubmit = slots.every((s) => s !== null) && !locked;
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
      toast.success("Top 5 submitted");
      navigate("/judge/home");
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
  const DISPLAY_COLUMNS = 5;
  const displayedCandidates = Array.from({ length: DISPLAY_COLUMNS }).map(
    (_, i) => candidates[i] ?? null
  );

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Top 5 Ranking</h1>
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

            // Determine candidate object: prefer available list match, otherwise search previous slots
            const cand =
              candInAvailable ??
              (existingIndex !== -1 ? slots[existingIndex] ?? null : null);
            if (!cand) return;

            next[slotIndex] = cand;
            setSlots(next);

            // If the candidate was taken from the available list (not moved between slots), remove it from available candidates
            if (candInAvailable) {
              setCandidates((prev) =>
                prev.filter((p) => p.candidateId !== candId)
              );
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
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
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
                  <div>Loading…</div>
                ) : candidates.length === 0 ? (
                  <div>No candidates</div>
                ) : (
                  <div className="grid grid-cols-5 gap-3">
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
              Submit Top 5
            </Button>
          </div>

          {confirmOpen && (
            <AlertDialog>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirm submission</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to submit the Top 5 rankings? This
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
                    <Button
                      onClick={handleConfirmSubmit}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? "Submitting..." : "Confirm"}
                    </Button>
                  </div>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
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
