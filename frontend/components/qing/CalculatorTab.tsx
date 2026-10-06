"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreateRun, useEditScores, useIndicators, usePublishRun } from "@/hooks/useQing";
import type { Indicator, RunResponse } from "@/types/api";
import { EMPTY_INPUTS, INDICATORS, buildEdits, efficiencyShade, fmt, type ScoreInputValues } from "@/utils/qing";
import { DelegatePicker } from "./DelegatePicker";
import { ScoreInputs } from "./ScoreInputs";

export function CalculatorTab() {
  const { data: delegates, isLoading } = useIndicators();
  const { mutateAsync: editScores, isPending: editing } = useEditScores();
  const { mutate: createRun, isPending: calculating } = useCreateRun();
  const { mutate: publish, isPending: publishing } = usePublishRun();

  const [selected, setSelected] = useState<number[]>([]);
  const [indicators, setIndicators] = useState<Indicator[]>(INDICATORS.map((i) => i.key));
  const [values, setValues] = useState<ScoreInputValues>(EMPTY_INPUTS);
  const [mode, setMode] = useState<"set" | "add">("set");
  const [run, setRun] = useState<RunResponse | null>(null);

  if (isLoading || !delegates) return <Skeleton className="h-64 w-full" />;

  const toggleIndicator = (key: Indicator) =>
    setIndicators((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));

  async function calculate() {
    const edits = buildEdits(selected, values, mode);
    try {
      if (edits.length > 0) {
        await editScores({ edits });
        setValues(EMPTY_INPUTS);
      }
    } catch {
      return; // the hook already showed the error
    }
    createRun(
      { characterIds: selected, indicators },
      { onSuccess: (r) => setRun(r) },
    );
  }

  const busy = editing || calculating;
  const canCalculate = selected.length > 0 && indicators.length > 0 && !busy;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-5">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">1. Affected delegates</h2>
          <DelegatePicker delegates={delegates} selected={selected} onChange={setSelected} />
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold">2. Change scores first (optional)</h2>
          <p className="text-muted-foreground text-xs">
            Fill in only what changes. This updates the selected delegates before calculating.
          </p>
          <ScoreInputs values={values} onValuesChange={setValues} mode={mode} onModeChange={setMode} />
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold">3. Indicators that count for this directive</h2>
          <div className="flex flex-wrap gap-4">
            {INDICATORS.map(({ key, label }) => (
              <label key={key} className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox checked={indicators.includes(key)} onCheckedChange={() => toggleIndicator(key)} />
                {label}
              </label>
            ))}
          </div>
          {indicators.length === 0 && (
            <p className="text-destructive text-xs">Pick at least one indicator.</p>
          )}
        </section>

        <Button onClick={calculate} disabled={!canCalculate}>
          {busy ? "Calculating..." : "Calculate efficiency"}
        </Button>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Result</h2>
        {!run ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-sm">
            Choose delegates and calculate to see the efficiency rating and a suggested outcome here.
          </p>
        ) : (
          <RunResult run={run} publishing={publishing} onPublish={() => publish(run.id, { onSuccess: () => setRun({ ...run, status: "PUBLISHED" }) })} />
        )}
      </div>
    </div>
  );
}

function RunResult({
  run,
  onPublish,
  publishing,
}: {
  run: RunResponse;
  onPublish: () => void;
  publishing: boolean;
}) {
  const multiple = run.results.length > 1;
  const labels = run.indicators.map((i) => INDICATORS.find((x) => x.key === i)?.label ?? i).join(", ");

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-baseline gap-3">
        <span
          className="rounded px-3 py-1 text-3xl font-bold tabular-nums"
          style={efficiencyShade(run.average)}
        >
          {fmt(run.average)}
        </span>
        <div>
          <p className="text-sm font-semibold">{run.band_label}</p>
          <p className="text-muted-foreground text-xs">
            {multiple ? `Average of ${run.results.length} delegates` : run.results[0]?.name} · {labels}
          </p>
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-sm">{run.tip}</p>
        {run.outcomes.length > 0 && (
          <>
            <p className="text-muted-foreground pt-1 text-xs">
              Suggested outcomes, mildest first. Use later ones for extreme scores. Backrooms have the final say.
            </p>
            <ol className="list-decimal space-y-0.5 pl-5 text-sm">
              {run.outcomes.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ol>
          </>
        )}
      </div>

      {multiple && (
        <ul className="divide-y rounded border text-sm">
          {run.results.map((r) => (
            <li key={r.character_id} className="flex items-center justify-between px-3 py-1.5">
              <span>{r.name}</span>
              <span className="tabular-nums">{fmt(r.efficiency)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3 border-t pt-3">
        {run.status === "PUBLISHED" ? (
          <Badge>Sent to the map</Badge>
        ) : (
          <Button onClick={onPublish} disabled={publishing}>
            Confirm and send to map
          </Button>
        )}
        <span className="text-muted-foreground text-xs">
          {run.status === "PUBLISHED"
            ? "Each delegate's own score is now on the delegate display. Use Undo to take it back."
            : "Sends each delegate's own score (not the average) to the delegate display."}
        </span>
      </div>
    </div>
  );
}
