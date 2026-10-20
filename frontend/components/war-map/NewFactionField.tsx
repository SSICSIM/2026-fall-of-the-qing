"use client";

import { useState } from "react";
import { PlusIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateFaction } from "@/hooks/useWarRoom";

/** The value a faction select uses for its "+ New faction…" option. */
export const NEW_FACTION = "__new_faction__";

/** Names a new faction in place, shown when "+ New faction…" is picked. */
export function NewFactionField({ onCreated, onCancel }: { onCreated: (id: number) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const create = useCreateFaction();
  const submit = () => {
    if (name.trim()) create.mutate({ name: name.trim() }, { onSuccess: (f) => onCreated(f.id) });
  };
  return (
    <div className="flex w-full gap-1.5">
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          // Not a form: this sits inside other forms.
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape") onCancel();
        }}
        placeholder="New faction name"
        aria-label="New faction name"
        className="bg-background h-8 text-xs md:text-xs"
      />
      <Button type="button" size="sm" className="h-8" disabled={!name.trim() || create.isPending} onClick={submit}>
        <PlusIcon />
        Add
      </Button>
      <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={onCancel} aria-label="Cancel">
        <XIcon />
      </Button>
    </div>
  );
}
