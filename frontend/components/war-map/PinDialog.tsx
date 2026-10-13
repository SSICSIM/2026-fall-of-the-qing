"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useNotes } from "@/hooks/useCrisisNotes";
import { useCreateAnnotation } from "@/hooks/useWarRoom";
import type { Pt } from "@/lib/warRoom/geometry";

export const PIN_COLORS = ["#8b2a1e", "#2b1d0e", "#4f6d8a", "#5f7a3a", "#c08a2e"];

export function PinDialog({ point, onClose }: { point: Pt | null; onClose: () => void }) {
  const [label, setLabel] = useState("");
  const [noteId, setNoteId] = useState("");
  const [color, setColor] = useState(PIN_COLORS[0]);
  const { data: notes } = useNotes({}, point != null);
  const create = useCreateAnnotation();

  useEffect(() => {
    if (point) {
      setLabel("");
      setNoteId("");
    }
  }, [point]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!point) return;
    create.mutate(
      {
        kind: "PIN",
        points: [point],
        label: label || undefined,
        color,
        crisis_note_id: noteId ? Number(noteId) : undefined,
      },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog open={point != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-[20px] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Add war pin</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Label</Label>
            <Input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Siege of Wuchang" />
          </div>
          <div className="space-y-1.5">
            <Label>Crisis note (optional)</Label>
            <NativeSelect className="w-full" value={noteId} onChange={(e) => setNoteId(e.target.value)}>
              <NativeSelectOption value="">Not linked</NativeSelectOption>
              {notes?.map((n) => (
                <NativeSelectOption key={n.id} value={n.id}>
                  {n.character.name}: {n.title}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label>Banner</Label>
            <div className="flex gap-2">
              {PIN_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Colour ${c}`}
                  onClick={() => setColor(c)}
                  className="h-7 w-7 rounded-full border-2 transition-transform"
                  style={{
                    background: c,
                    borderColor: color === c ? "var(--primary)" : "transparent",
                    transform: color === c ? "scale(1.12)" : undefined,
                  }}
                />
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              Add pin
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
