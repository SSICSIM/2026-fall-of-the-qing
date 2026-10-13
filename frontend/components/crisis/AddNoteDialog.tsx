"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCharacters } from "@/hooks/useCharacters";
import { useCreateNote } from "@/hooks/useCrisisNotes";
import type { CrisisNoteResponse, NoteType, Priority } from "@/types/api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activePeriodId: number;
  /** Prefill the character and/or type, e.g. "new directive for this delegate". */
  defaultCharacterId?: number;
  defaultNoteType?: NoteType;
  onCreated?: (note: CrisisNoteResponse) => void;
}

const EMPTY = {
  character_id: "",
  title: "",
  description: "",
  crisis_staff_notes: "",
  priority: "" as Priority | "",
  note_type: "" as NoteType | "",
};

export function AddNoteDialog({
  open,
  onOpenChange,
  activePeriodId,
  defaultCharacterId,
  defaultNoteType,
  onCreated,
}: Props) {
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (!open) return;
    setForm((f) => ({
      ...f,
      character_id: defaultCharacterId != null ? String(defaultCharacterId) : f.character_id,
      note_type: defaultNoteType ?? f.note_type,
    }));
  }, [open, defaultCharacterId, defaultNoteType]);
  const { data: characters } = useCharacters();
  const { mutate, isPending } = useCreateNote();

  function set(key: keyof typeof EMPTY, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.character_id || !form.title || !form.description || !form.priority || !form.note_type) return;
    mutate(
      {
        character_id: Number(form.character_id),
        period_id: activePeriodId,
        title: form.title,
        description: form.description,
        crisis_staff_notes: form.crisis_staff_notes || undefined,
        priority: form.priority as Priority,
        note_type: form.note_type as NoteType,
      },
      {
        onSuccess: (note) => {
          setForm(EMPTY);
          onOpenChange(false);
          onCreated?.(note);
        },
      }
    );
  }

  const isValid =
    !!form.character_id && !!form.title && !!form.description && !!form.priority && !!form.note_type;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Crisis Note</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Character</Label>
              <Select value={form.character_id} onValueChange={(v) => set("character_id", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select character…" />
                </SelectTrigger>
                <SelectContent>
                  {characters?.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => set("priority", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Priority…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={form.note_type} onValueChange={(v) => set("note_type", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Directive type…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PRIVATE_DIRECTIVE">Private Directive</SelectItem>
                <SelectItem value="PUBLIC_DIRECTIVE">Public Directive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input
              placeholder="Directive title…"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              placeholder="What the directive says…"
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>
              Crisis Staff Notes{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              placeholder="Internal staff commentary…"
              rows={2}
              value={form.crisis_staff_notes}
              onChange={(e) => set("crisis_staff_notes", e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending || !isValid}>
              {isPending ? "Adding…" : "Add Note"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
