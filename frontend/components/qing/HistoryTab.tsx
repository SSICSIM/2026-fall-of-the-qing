"use client";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useHistory, useIndicators } from "@/hooks/useQing";
import type { ActionResponse } from "@/types/api";

type Change = { character_id: number; indicator: string; old: number; new: number };
type PublishEntry = { character_id: number; efficiency: number | null };

export function HistoryTab() {
  const { data: actions, isLoading } = useHistory();
  const { data: delegates } = useIndicators();
  const names = new Map((delegates ?? []).map((d) => [d.character_id, d.name]));
  const name = (id: number) => names.get(id) ?? `#${id}`;

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!actions || actions.length === 0)
    return <p className="text-muted-foreground text-sm">Nothing has happened yet.</p>;

  function describe(a: ActionResponse): string {
    if (a.kind === "SCORE_EDIT") {
      const changes = (a.payload.changes ?? []) as Change[];
      const shown = changes
        .slice(0, 3)
        .map((c) => `${name(c.character_id)} ${c.indicator.toLowerCase()} ${c.old} → ${c.new}`)
        .join("; ");
      return changes.length > 3 ? `${shown}; +${changes.length - 3} more` : shown;
    }
    const after = (a.payload.after ?? []) as PublishEntry[];
    return `Sent to map: ${after.map((e) => `${name(e.character_id)} ${e.efficiency}`).join(", ")}`;
  }

  return (
    <ul className="divide-y rounded-lg border">
      {actions.map((a) => (
        <li key={a.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
          <Badge variant={a.kind === "PUBLISH" ? "default" : "secondary"}>
            {a.kind === "PUBLISH" ? "Map" : "Scores"}
          </Badge>
          <div className={a.reverted_at ? "text-muted-foreground flex-1 line-through" : "flex-1"}>
            {describe(a)}
            {a.note && <span className="text-muted-foreground"> · {a.note}</span>}
          </div>
          {a.reverted_at && <Badge variant="outline">undone</Badge>}
          <time className="text-muted-foreground text-xs whitespace-nowrap">
            {new Date(a.created_at).toLocaleTimeString()}
          </time>
        </li>
      ))}
    </ul>
  );
}
