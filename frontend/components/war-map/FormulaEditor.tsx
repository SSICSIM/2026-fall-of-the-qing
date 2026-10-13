"use client";

import { useState } from "react";
import { PencilIcon, PlusIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useFormula, useResetFormula, useUpdateFormula } from "@/hooks/useWarRoom";
import { cn } from "@/lib/utils";
import type { BandTone } from "@/types/api";
import { SectionHeading } from "./parts";

const TONES: { value: BandTone; label: string }[] = [
  { value: "bad", label: "Consequence" },
  { value: "neutral", label: "Minor" },
  { value: "good", label: "Benefit" },
];

const TONE_CLASS: Record<BandTone, string> = {
  bad: "bg-destructive text-white",
  neutral: "bg-chart-4 text-white",
  good: "bg-chart-2 text-white",
};

interface DraftBand {
  label: string;
  tone: BandTone;
  min: string;
  tips: string;
}

/** Problems that would make the backend reject the formula, in plain words. */
function problemsWith(midpoint: string, bands: DraftBand[]): string | null {
  const m = Number(midpoint);
  if (!(m > 0 && m <= 5)) return "The divisor must be above 0 and at most 5.";
  if (bands.some((b) => !b.label.trim())) return "Every band needs a name.";
  const mins = bands.map((b) => Number(b.min));
  if (mins.some((x) => Number.isNaN(x) || x < 0)) return "Thresholds must be numbers of 0 or more.";
  if (mins.some((x, i) => i > 0 && x <= mins[i - 1])) return "Each band must start higher than the one before it.";
  return null;
}

/** The efficiency formula's divisor, thresholds and tips, editable by staff. */
export function FormulaEditor() {
  const formula = useFormula();
  const update = useUpdateFormula();
  const reset = useResetFormula();
  const [editing, setEditing] = useState(false);
  const [midpoint, setMidpoint] = useState("");
  const [bands, setBands] = useState<DraftBand[]>([]);

  function startEditing() {
    setMidpoint(String(formula.midpoint));
    setBands(formula.bands.map((b) => ({ label: b.label, tone: b.tone, min: String(b.min), tips: b.tips.join("\n") })));
    setEditing(true);
  }

  const setBand = (i: number, patch: Partial<DraftBand>) =>
    setBands((bs) => bs.map((b, j) => (j === i ? { ...b, ...patch } : b)));

  function addBand() {
    const last = bands.at(-1);
    const min = last ? String(Math.round((Number(last.min) + 0.5) * 100) / 100) : "0";
    setBands((bs) => [...bs, { label: "", tone: "good", min, tips: "" }]);
  }

  const problem = editing ? problemsWith(midpoint, bands) : null;

  function save() {
    if (problem) return;
    update.mutate(
      {
        midpoint: Number(midpoint),
        bands: bands.map((b, i) => ({
          label: b.label.trim(),
          tone: b.tone,
          min_rating: i === 0 ? 0 : Number(b.min),
          tips: b.tips.split("\n").map((t) => t.trim()).filter(Boolean),
        })),
      },
      { onSuccess: () => setEditing(false) },
    );
  }

  return (
    <section>
      <SectionHeading title="Formula">
        <div className="flex gap-1.5">
          {!formula.isDefault && !editing ? (
            <Button size="sm" variant="ghost" className="h-7" disabled={reset.isPending} onClick={() => reset.mutate()}>
              <RotateCcwIcon />
              Reset to PRD
            </Button>
          ) : null}
          {!editing ? (
            <Button size="sm" variant="outline" className="h-7" onClick={startEditing}>
              <PencilIcon />
              Edit
            </Button>
          ) : null}
        </div>
      </SectionHeading>

      {!editing ? (
        <div className="mt-3 space-y-2 rounded-lg border px-3.5 py-3 text-sm">
          <p className="font-mono text-xs">
            ⁿ√(Π score ÷ {formula.midpoint}) · ratings 0–{Math.round((5 / formula.midpoint) * 100) / 100}
            {formula.isDefault ? <span className="text-muted-foreground"> · PRD</span> : <span className="text-primary"> · edited</span>}
          </p>
          <ul className="space-y-1">
            {formula.bands.map((b, i) => {
              const next = formula.bands[i + 1];
              return (
                <li key={b.key} className="flex items-center gap-2 text-xs">
                  <span className="w-20 shrink-0 tabular-nums">
                    {next ? `${b.min} – <${next.min}` : `${b.min}+`}
                  </span>
                  <Badge className={TONE_CLASS[b.tone]}>{b.label}</Badge>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="mt-3 space-y-3 rounded-lg border px-3.5 py-3">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              Divide each score by
              <span className="text-muted-foreground block text-xs">2.5 makes an average delegate rate 1.00</span>
            </span>
            <Input
              id="formula-midpoint"
              type="number"
              step="0.1"
              min="0.1"
              max="5"
              value={midpoint}
              onChange={(e) => setMidpoint(e.target.value)}
              className="h-8 w-20 text-center tabular-nums"
            />
          </label>

          <ul className="space-y-2.5">
            {bands.map((b, i) => (
              <li key={i} className="bg-muted/40 space-y-2 rounded-md p-2.5">
                <div className="flex items-center gap-1.5">
                  <Input
                    id={`band-min-${i}`}
                    type="number"
                    step="0.05"
                    min="0"
                    aria-label="Starts at rating"
                    title="Starts at rating"
                    disabled={i === 0}
                    value={i === 0 ? "0" : b.min}
                    onChange={(e) => setBand(i, { min: e.target.value })}
                    className="bg-background h-8 w-16 text-center text-xs tabular-nums md:text-xs"
                  />
                  <Input
                    id={`band-label-${i}`}
                    aria-label="Band name"
                    placeholder="Band name"
                    value={b.label}
                    onChange={(e) => setBand(i, { label: e.target.value })}
                    className="bg-background h-8 min-w-0 flex-1 text-xs md:text-xs"
                  />
                  <Select value={b.tone} onValueChange={(v) => setBand(i, { tone: v as BandTone })}>
                    <SelectTrigger size="sm" className="bg-background h-8 w-[110px] text-xs" aria-label="Colour">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                      {TONES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          <span className={cn("size-2 rounded-full", TONE_CLASS[t.value])} />
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    aria-label="Remove band"
                    disabled={bands.length === 1}
                    onClick={() => setBands((bs) => bs.filter((_, j) => j !== i))}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
                <Textarea
                  id={`band-tips-${i}`}
                  rows={2}
                  aria-label="Tips, one per line"
                  placeholder="Tips, one per line, least severe first"
                  value={b.tips}
                  onChange={(e) => setBand(i, { tips: e.target.value })}
                  className="bg-background text-xs md:text-xs"
                />
              </li>
            ))}
          </ul>

          <Button size="sm" variant="outline" className="h-7 w-full" disabled={bands.length >= 8} onClick={addBand}>
            <PlusIcon />
            Add band
          </Button>

          {problem ? <p className="text-destructive text-xs">{problem}</p> : null}
          <p className="text-muted-foreground text-xs">
            Ratings already on the map keep their old value until you send them again.
          </p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={problem != null || update.isPending} onClick={save}>
              Save formula
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
