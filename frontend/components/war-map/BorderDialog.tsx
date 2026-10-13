"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNotes } from "@/hooks/useCrisisNotes";
import { Checkbox } from "@/components/ui/checkbox";
import { useRedrawProvince } from "@/hooks/useWarRoom";
import type { Pt } from "@/lib/warRoom/geometry";
import { adjustNeighbours } from "@/lib/warRoom/neighbours";
import { outlineFromPath } from "@/lib/warRoom/outline";
import { PROVINCE_NAMES, QING } from "@/lib/warRoom/provinces";
import type { ProvinceResponse } from "@/types/api";
import { NewNoteDialog } from "./NewNoteDialog";

const NONE = "__none__";

/** Confirms a redrawn border, citing the crisis note behind it. */
/** A province's outline as it is now: a saved redraw, else its main landmass. */
function currentOutline(id: string, provinces: ProvinceResponse[]): Pt[] {
  const saved = provinces.find((p) => p.id === id)?.shape;
  return saved ? (saved as Pt[]) : outlineFromPath(QING.provinces.find((p) => p.id === id)?.d ?? "").points;
}

export function BorderDialog({
  provinceId,
  ownerId,
  points,
  provinces,
  onSaved,
  onClose,
}: {
  provinceId: string | null;
  /** The province's owner, suggested as the author of a new note. */
  ownerId?: number;
  points: Pt[];
  provinces: ProvinceResponse[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const [noteId, setNoteId] = useState(NONE);
  const [reason, setReason] = useState("");
  const [writing, setWriting] = useState(false);
  const [moveNeighbours, setMoveNeighbours] = useState(true);
  const redraw = useRedrawProvince();
  const open = provinceId != null;
  const { data: notes = [] } = useNotes({}, open);

  useEffect(() => {
    if (open) {
      setNoteId(NONE);
      setReason("");
      setMoveNeighbours(true);
    }
  }, [open]);

  // Which neighbours the new border pushes into or pulls away from.
  const neighbours = useMemo(() => {
    if (!provinceId || points.length < 3) return {};
    const others = Object.fromEntries(
      QING.provinces.filter((p) => p.id !== provinceId).map((p) => [p.id, currentOutline(p.id, provinces)]),
    );
    return adjustNeighbours(currentOutline(provinceId, provinces), points, others);
  }, [provinceId, points, provinces]);
  const neighbourIds = Object.keys(neighbours);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!provinceId || noteId === NONE) return;
    redraw.mutate(
      {
        id: provinceId,
        body: {
          shape: points,
          neighbour_shapes: moveNeighbours ? neighbours : undefined,
          crisis_note_id: Number(noteId),
          reason: reason.trim() || undefined,
        },
      },
      { onSuccess: onSaved },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-[20px] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">
            Save new border{provinceId ? ` for ${PROVINCE_NAMES[provinceId]}` : ""}
          </DialogTitle>
          <DialogDescription className="sr-only">Link the new border to a crisis note</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Crisis note behind this change (required)</Label>
            <Select value={noteId} onValueChange={setNoteId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{notes.length ? "Choose a note…" : "No crisis notes yet"}</SelectItem>
                {notes.map((n) => (
                  <SelectItem key={n.id} value={String(n.id)}>
                    {n.character.name}: {n.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button type="button" onClick={() => setWriting(true)} className="text-primary text-xs hover:underline">
              + Write a new crisis note
            </button>
          </div>
          {neighbourIds.length ? (
            <label className="flex items-start gap-2 rounded-md border p-2.5 text-sm">
              <Checkbox
                id="move-neighbours"
                className="mt-0.5"
                checked={moveNeighbours}
                onCheckedChange={(v) => setMoveNeighbours(v === true)}
              />
              <span>
                Move the neighbouring borders too
                <span className="text-muted-foreground block text-xs">
                  {neighbourIds.map((id) => PROVINCE_NAMES[id]).join(", ")}
                  {neighbourIds.includes("guangdong") ? " (Guangdong keeps its mainland outline only; Hainan isn't redrawn)" : ""}
                </span>
              </span>
            </label>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="border-reason" className="text-xs">
              Reason (optional)
            </Label>
            <Input
              id="border-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Treaty of Tianjin cedes the northern counties"
              className="h-10"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Keep drawing
            </Button>
            <Button type="submit" disabled={noteId === NONE || redraw.isPending}>
              Save border
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      <NewNoteDialog
        open={writing}
        onOpenChange={setWriting}
        defaultCharacterId={ownerId}
        onCreated={(note) => setNoteId(String(note.id))}
      />
    </Dialog>
  );
}
