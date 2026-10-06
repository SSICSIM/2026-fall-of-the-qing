"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useSetNotes } from "@/hooks/useQing";
import type { IndicatorRow } from "@/types/api";

interface Props {
  delegate: IndicatorRow | null;
  onClose: () => void;
}

export function NotesDialog({ delegate, onClose }: Props) {
  return (
    <Dialog open={delegate !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {delegate && <NotesForm key={delegate.character_id} delegate={delegate} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function NotesForm({ delegate, onClose }: { delegate: IndicatorRow; onClose: () => void }) {
  const [text, setText] = useState(delegate.notes ?? "");
  const { mutate, isPending } = useSetNotes();

  return (
    <>
      <DialogHeader>
        <DialogTitle>Notes: {delegate.name}</DialogTitle>
      </DialogHeader>
      <p className="text-muted-foreground text-sm">
        Backroom only. For example, absolute strength in each indicator. Never shown to delegates.
      </p>
      <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={isPending}
          onClick={() => mutate({ characterId: delegate.character_id, notes: text.trim() || null }, { onSuccess: onClose })}
        >
          Save
        </Button>
      </div>
    </>
  );
}
