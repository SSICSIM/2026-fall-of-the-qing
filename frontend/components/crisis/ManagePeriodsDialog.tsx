"use client";

import { useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDeletePeriod, usePeriods, useReopenPeriod } from "@/hooks/useCrisisPeriods";
import type { CrisisPeriodResponse } from "@/types/api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const notes = (n: number) => `${n} note${n === 1 ? "" : "s"}`;

/** Undo a period started by mistake, or go back to an earlier one. */
export function ManagePeriodsDialog({ open, onOpenChange }: Props) {
  const { data: periods = [] } = usePeriods();
  const reopen = useReopenPeriod();
  const remove = useDeletePeriod();
  const [deleteTarget, setDeleteTarget] = useState<CrisisPeriodResponse | null>(null);
  const active = periods.find((p) => p.is_active);
  // Deleting the active period hands over to the most recently archived one.
  const fallback = periods
    .filter((p) => !p.is_active)
    .sort((a, b) => (b.archived_at ?? "").localeCompare(a.archived_at ?? ""))[0];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Periods</DialogTitle>
            <DialogDescription>
              Reopen an earlier period to go back to it, or delete one that was started by mistake.
            </DialogDescription>
          </DialogHeader>
          <ul className="divide-y rounded-md border">
            {periods.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {p.name} {p.is_active ? <Badge className="ml-1">Active</Badge> : null}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {notes(p.note_count)} · started {new Date(p.created_at).toLocaleString()}
                  </p>
                </div>
                {!p.is_active ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={reopen.isPending}
                    onClick={() => reopen.mutate(p.id)}
                  >
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    Reopen
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  aria-label={`Delete ${p.name}`}
                  onClick={() => setDeleteTarget(p)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
            {periods.length === 0 ? (
              <li className="text-muted-foreground px-3 py-4 text-center text-sm">No periods yet.</li>
            ) : null}
          </ul>
          {active ? (
            <p className="text-muted-foreground text-xs">Reopening archives {active.name}.</p>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deleteTarget?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the period and its {notes(deleteTarget?.note_count ?? 0)}, including staff
              notes. It can&apos;t be undone.
              {deleteTarget?.is_active && fallback ? ` ${fallback.name} becomes the active period again.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={() => deleteTarget && remove.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) })}
            >
              {remove.isPending ? "Deleting…" : "Delete period"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
