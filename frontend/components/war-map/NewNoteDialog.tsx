"use client";

import { useState } from "react";

import { AddNoteDialog } from "@/components/crisis/AddNoteDialog";
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
import { useActivePeriod, useCreatePeriod } from "@/hooks/useCrisisPeriods";
import type { CrisisNoteResponse, NoteType } from "@/types/api";

/** The Crisis Tracker's "Add note" form, usable from the map. Notes belong to
 * an update period, so if none is running it starts one first. */
export function NewNoteDialog({
  open,
  onOpenChange,
  defaultCharacterId,
  defaultNoteType,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCharacterId?: number;
  defaultNoteType?: NoteType;
  onCreated?: (note: CrisisNoteResponse) => void;
}) {
  const { data: period, isLoading } = useActivePeriod();
  if (!open || isLoading) return null;
  if (!period) return <StartPeriodDialog onOpenChange={onOpenChange} />;
  return (
    <AddNoteDialog
      open={open}
      onOpenChange={onOpenChange}
      activePeriodId={period.id}
      defaultCharacterId={defaultCharacterId}
      defaultNoteType={defaultNoteType}
      onCreated={onCreated}
    />
  );
}

function StartPeriodDialog({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const [name, setName] = useState("Update 1");
  const create = useCreatePeriod();
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[20px] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Start an update first</DialogTitle>
          <DialogDescription>
            Crisis notes are filed under the current update period, and none is running yet.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            // On success the active period exists and this dialog becomes the note form.
            if (name.trim()) create.mutate({ name: name.trim() });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="period-name" className="text-xs">
              Period name
            </Label>
            <Input id="period-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} className="h-10" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              Start period
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
