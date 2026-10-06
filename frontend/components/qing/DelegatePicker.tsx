"use client";

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useCreateGroup, useDeleteGroup, useGroups } from "@/hooks/useQing";
import type { IndicatorRow } from "@/types/api";

interface Props {
  delegates: IndicatorRow[];
  selected: number[];
  onChange: (ids: number[]) => void;
}

/** Search + multi-select list of delegates, with saved group presets. */
export function DelegatePicker({ delegates, selected, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [groupName, setGroupName] = useState("");
  const { data: groups } = useGroups();
  const { mutate: createGroup, isPending: saving } = useCreateGroup();
  const { mutate: deleteGroup } = useDeleteGroup();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? delegates.filter(
          (d) => d.name.toLowerCase().includes(q) || (d.region ?? "").toLowerCase().includes(q),
        )
      : delegates;
  }, [delegates, query]);

  const selectedSet = new Set(selected);
  const toggle = (id: number) =>
    onChange(selectedSet.has(id) ? selected.filter((s) => s !== id) : [...selected, id]);

  return (
    <div className="space-y-3">
      {groups && groups.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-xs">Groups:</span>
          {groups.map((g) => (
            <span key={g.id} className="inline-flex items-center">
              <Button
                variant="outline"
                size="xs"
                className="rounded-r-none"
                onClick={() => {
                  const valid = new Set(delegates.map((d) => d.character_id));
                  onChange(g.character_ids.filter((id) => valid.has(id)));
                }}
              >
                {g.name} ({g.character_ids.length})
              </Button>
              <Button
                variant="outline"
                size="icon-xs"
                className="rounded-l-none border-l-0"
                aria-label={`Delete group ${g.name}`}
                onClick={() => deleteGroup(g.id)}
              >
                <Trash2 />
              </Button>
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search delegates or regions"
          className="h-8 w-64"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange(visible.map((d) => d.character_id))}
          disabled={visible.length === 0}
        >
          Select shown
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onChange([])} disabled={selected.length === 0}>
          Clear
        </Button>
        <span className="text-muted-foreground text-xs">{selected.length} selected</span>
      </div>

      <div className="max-h-56 overflow-y-auto rounded-lg border">
        {visible.length === 0 ? (
          <p className="text-muted-foreground p-3 text-sm">No delegates match.</p>
        ) : (
          visible.map((d) => (
            <label
              key={d.character_id}
              className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 border-b px-3 py-1.5 text-sm last:border-b-0"
            >
              <Checkbox
                checked={selectedSet.has(d.character_id)}
                onCheckedChange={() => toggle(d.character_id)}
              />
              <span className="font-medium">{d.name}</span>
              {d.region && <span className="text-muted-foreground text-xs">{d.region}</span>}
            </label>
          ))
        )}
      </div>

      {selected.length > 0 && (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const name = groupName.trim();
            if (!name) return;
            createGroup({ name, characterIds: selected }, { onSuccess: () => setGroupName("") });
          }}
        >
          <Input
            placeholder="Save selection as group..."
            className="h-8 w-56"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
          />
          <Button type="submit" variant="outline" size="sm" disabled={!groupName.trim() || saving}>
            Save group
          </Button>
        </form>
      )}
    </div>
  );
}
