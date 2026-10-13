"use client";

import { useRef, useState } from "react";
import { Trash2, Upload } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCharacters,
  useCreateCharacter,
  useDeleteCharacter,
  useBulkUploadCharacters,
} from "@/hooks/useCharacters";
import { useMapState } from "@/hooks/useWarRoom";
import { holderIds } from "@/lib/warRoom/control";
import { pinSpotIn } from "@/lib/warRoom/pins";
import { PROVINCE_NAMES, QING } from "@/lib/warRoom/provinces";
import { cn } from "@/lib/utils";
import type { CharacterResponse } from "@/types/api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CharacterManagerDialog({ open, onOpenChange }: Props) {
  const [name, setName] = useState("");
  const [homes, setHomes] = useState<string[]>([]);
  const [factionId, setFactionId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<CharacterResponse | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: characters, isLoading } = useCharacters();
  const { mutate: create, isPending: creating } = useCreateCharacter();
  const { mutate: remove, isPending: deleting } = useDeleteCharacter();
  const { mutate: bulkUpload, isPending: uploading } = useBulkUploadCharacters();
  const { data: map } = useMapState(0);
  const names = new Map(map?.delegates.map((d) => [d.id, d.name]));
  const heldBy = (pid: string) => {
    const p = map?.provinces.find((x) => x.id === pid);
    return p ? holderIds(p).map((id) => names.get(id) ?? "?") : [];
  };

  function toggleHome(pid: string) {
    setHomes((h) => (h.includes(pid) ? h.filter((x) => x !== pid) : [...h, pid]));
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    // Drop the pin in their first home province.
    const first = QING.provinces.find((p) => p.id === homes[0]);
    const [x, y] = first ? pinSpotIn(first.label, characters?.length ?? 0) : [undefined, undefined];
    create(
      { name: name.trim(), province_ids: homes, x, y, faction_id: factionId ? Number(factionId) : undefined },
      {
        onSuccess: () => {
          setName("");
          setHomes([]);
        },
      },
    );
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    bulkUpload(file, { onSettled: () => { if (fileRef.current) fileRef.current.value = ""; } });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Manage Characters</DialogTitle>
        </DialogHeader>

        <div className="max-h-64 space-y-1 overflow-y-auto">
          {isLoading && (
            <>
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-3/4" />
            </>
          )}
          {!isLoading && (!characters || characters.length === 0) && (
            <p className="text-muted-foreground text-sm">No characters yet.</p>
          )}
          {characters?.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/50"
            >
              <span className="text-sm">{c.name}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => setDeleteTarget(c)}
                aria-label={`Remove ${c.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <Separator />

        <form onSubmit={handleAdd} className="space-y-2">
          <div className="flex gap-2">
            <Input
              placeholder="Character name…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" disabled={creating || !name.trim()}>
              Add
            </Button>
          </div>
          {map?.factions.length ? (
            <NativeSelect
              id="new-character-faction"
              aria-label="Faction"
              className="w-full"
              value={factionId}
              onChange={(e) => setFactionId(e.target.value)}
            >
              <NativeSelectOption value="">No faction</NativeSelectOption>
              {map.factions.map((f) => (
                <NativeSelectOption key={f.id} value={f.id}>
                  {f.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          ) : null}
          <div>
            <div className="text-muted-foreground mb-1 text-xs">
              Home provinces · their pin goes on the first one; with none they start off the map
            </div>
            <div className="flex max-h-36 flex-wrap gap-1 overflow-y-auto">
              {QING.provinces.map((p) => {
                const on = homes.includes(p.id);
                const holders = heldBy(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    title={holders.length ? `Held by ${holders.join(", ")}` : "Unclaimed"}
                    onClick={() => toggleHome(p.id)}
                    className={cn(
                      "rounded-md border px-1.5 py-0.5 text-xs",
                      on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                    )}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
            {homes.length ? (
              <ul className="text-muted-foreground mt-1.5 space-y-0.5 text-xs">
                {homes.map((pid) => {
                  const holders = heldBy(pid);
                  return (
                    <li key={pid}>
                      {PROVINCE_NAMES[pid]}:{" "}
                      {holders.length ? `shares with ${holders.join(", ")}` : "holds alone"}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        </form>

        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".json,.xlsx"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="mr-2 h-3.5 w-3.5" />
            {uploading ? "Importing…" : "Import from .xlsx or .json"}
          </Button>
        </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the character and every crisis note ever written about
              them — including notes in archived periods. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={() => {
                if (deleteTarget) remove(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
