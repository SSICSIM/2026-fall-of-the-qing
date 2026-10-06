"use client";

import { useState } from "react";
import { StickyNote } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEditScores, useIndicators } from "@/hooks/useQing";
import { EMPTY_INPUTS, buildEdits, efficiencyShade, fmt, type ScoreInputValues } from "@/utils/qing";
import { DelegatePicker } from "./DelegatePicker";
import { NotesDialog } from "./NotesDialog";
import { ScoreInputs } from "./ScoreInputs";
import type { IndicatorRow } from "@/types/api";

export function ScoresTab() {
  const { data, isLoading, isError } = useIndicators();
  const { mutate: edit, isPending } = useEditScores();
  const [selected, setSelected] = useState<number[]>([]);
  const [values, setValues] = useState<ScoreInputValues>(EMPTY_INPUTS);
  const [mode, setMode] = useState<"set" | "add">("set");
  const [notesFor, setNotesFor] = useState<IndicatorRow | null>(null);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (isError || !data) return <p className="text-destructive text-sm">Could not load delegates.</p>;
  if (data.length === 0)
    return (
      <p className="text-muted-foreground text-sm">
        No delegates yet. Add some with the Characters button in the top bar.
      </p>
    );

  const edits = buildEdits(selected, values, mode);

  function apply() {
    edit(
      { edits },
      {
        onSuccess: () => {
          toast.success(`Updated ${selected.length} delegate${selected.length !== 1 ? "s" : ""}.`);
          setValues(EMPTY_INPUTS);
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="text-sm font-semibold">Edit scores for several delegates at once</h2>
        <DelegatePicker delegates={data} selected={selected} onChange={setSelected} />
        <ScoreInputs values={values} onValuesChange={setValues} mode={mode} onModeChange={setMode} />
        <div className="flex items-center gap-3">
          <Button onClick={apply} disabled={isPending || selected.length === 0 || edits.length === 0}>
            Apply to {selected.length || "..."} delegate{selected.length === 1 ? "" : "s"}
          </Button>
          <span className="text-muted-foreground text-xs">
            Scores run 0 to 5 (2.5 is average). Values outside that range are clamped. Edits can be undone.
          </span>
        </div>
      </section>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Delegate</TableHead>
            <TableHead>Region</TableHead>
            <TableHead className="text-right">Legitimacy</TableHead>
            <TableHead className="text-right">Military</TableHead>
            <TableHead className="text-right">Economics</TableHead>
            <TableHead className="text-right">Efficiency</TableHead>
            <TableHead className="text-right">On map</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((d) => {
            const stale = d.published_efficiency !== null && d.published_efficiency !== d.efficiency;
            return (
              <TableRow key={d.character_id}>
                <TableCell className="font-medium">{d.name}</TableCell>
                <TableCell className="text-muted-foreground">{d.region ?? "-"}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(d.legitimacy, 1)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(d.military, 1)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(d.economics, 1)}</TableCell>
                <TableCell className="text-right">
                  <span
                    className="inline-block min-w-12 rounded px-2 py-0.5 text-center tabular-nums"
                    style={efficiencyShade(d.efficiency)}
                  >
                    {fmt(d.efficiency)}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {d.published_efficiency === null ? (
                    <span className="text-muted-foreground">not sent</span>
                  ) : (
                    <>
                      {fmt(d.published_efficiency)}
                      {stale && (
                        <Badge variant="outline" className="ml-2">
                          out of date
                        </Badge>
                      )}
                    </>
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    variant={d.notes ? "secondary" : "ghost"}
                    size="icon-sm"
                    aria-label={`Notes for ${d.name}`}
                    onClick={() => setNotesFor(d)}
                  >
                    <StickyNote />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <NotesDialog delegate={notesFor} onClose={() => setNotesFor(null)} />
    </div>
  );
}
