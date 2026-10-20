"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useAddProvince } from "@/hooks/useWarRoom";
import type { Pt } from "@/lib/warRoom/geometry";
import { carveOut } from "@/lib/warRoom/neighbours";
import { outlineFromPath } from "@/lib/warRoom/outline";
import { mapProvinces, provinceNames } from "@/lib/warRoom/provinces";
import type { MapStateResponse } from "@/types/api";
import { NewNoteDialog } from "./NewNoteDialog";

const NONE = "__none__";

/** Names a province just drawn on the map, its holder, and the land it takes. */
export function AddProvinceDialog({
  open,
  points,
  state,
  onSaved,
  onClose,
}: {
  open: boolean;
  points: Pt[];
  state: MapStateResponse;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [holderId, setHolderId] = useState(NONE);
  const [noteId, setNoteId] = useState(NONE);
  const [takeLand, setTakeLand] = useState(true);
  const [writing, setWriting] = useState(false);
  const add = useAddProvince();
  const { data: notes = [] } = useNotes({}, open);

  useEffect(() => {
    if (open) {
      setName("");
      setHolderId(NONE);
      setNoteId(NONE);
      setTakeLand(true);
    }
  }, [open]);

  // The provinces whose land the new one covers, with that land cut out.
  const neighbours = useMemo(() => {
    if (!open || points.length < 3) return {};
    const outlines = Object.fromEntries(
      mapProvinces(state.provinces).map((p) => [p.id, p.custom ?? outlineFromPath(p.d).points]),
    );
    return carveOut(points, outlines);
  }, [open, points, state.provinces]);
  const neighbourIds = Object.keys(neighbours);
  const names = provinceNames(state.provinces);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    add.mutate(
      {
        name: name.trim(),
        shape: points,
        neighbour_shapes: takeLand ? neighbours : undefined,
        controller_id: holderId === NONE ? null : Number(holderId),
        crisis_note_id: noteId === NONE ? undefined : Number(noteId),
      },
      { onSuccess: onSaved },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-[20px] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Add province</DialogTitle>
          <DialogDescription className="sr-only">Name the new province and choose who holds it</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="province-name" className="text-xs">
              Name
            </Label>
            <Input
              id="province-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Chahar"
              className="h-10"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Held by</Label>
            <Select value={holderId} onValueChange={setHolderId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Unclaimed</SelectItem>
                {state.delegates.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Crisis note behind this change (optional)</Label>
            <Select value={noteId} onValueChange={setNoteId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
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
              <Checkbox className="mt-0.5" checked={takeLand} onCheckedChange={(v) => setTakeLand(v === true)} />
              <span>
                Take this land from the provinces underneath
                <span className="text-muted-foreground block text-xs">
                  {neighbourIds.map((id) => names[id]).join(", ")}
                </span>
              </span>
            </label>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Keep drawing
            </Button>
            <Button type="submit" disabled={!name.trim() || add.isPending}>
              Add province
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      <NewNoteDialog
        open={writing}
        onOpenChange={setWriting}
        defaultCharacterId={holderId === NONE ? undefined : Number(holderId)}
        onCreated={(note) => setNoteId(String(note.id))}
      />
    </Dialog>
  );
}
