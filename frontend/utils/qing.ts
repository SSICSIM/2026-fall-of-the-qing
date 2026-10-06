import type { Indicator, ScoreEdit } from "@/types/api";

export const INDICATORS: { key: Indicator; label: string; short: string }[] = [
  { key: "LEGITIMACY", label: "Legitimacy", short: "L" },
  { key: "MILITARY", label: "Military", short: "M" },
  { key: "ECONOMICS", label: "Economics", short: "E" },
];

export const INDICATOR_FIELD: Record<Indicator, "legitimacy" | "military" | "economics"> = {
  LEGITIMACY: "legitimacy",
  MILITARY: "military",
  ECONOMICS: "economics",
};

export type ScoreInputValues = Record<Indicator, string>;
export const EMPTY_INPUTS: ScoreInputValues = { LEGITIMACY: "", MILITARY: "", ECONOMICS: "" };

export function fmt(n: number | null | undefined, dp = 2): string {
  return n === null || n === undefined ? "-" : n.toFixed(dp);
}

/** One edit per (delegate, indicator) for every filled-in input. Blank inputs are skipped. */
export function buildEdits(
  characterIds: number[],
  values: ScoreInputValues,
  mode: "set" | "add",
): ScoreEdit[] {
  const edits: ScoreEdit[] = [];
  for (const { key } of INDICATORS) {
    const raw = values[key].trim();
    if (raw === "") continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    for (const character_id of characterIds) {
      edits.push({ character_id, indicator: key, mode, value });
    }
  }
  return edits;
}

/** Blue shading by efficiency (darker = higher). Efficiency runs 0-2 on the 0-5 indicator scale. */
export function efficiencyShade(efficiency: number): { background: string; color: string } {
  const t = Math.min(Math.max(efficiency / 2, 0), 1);
  const lightness = 92 - t * 62;
  return {
    background: `hsl(215 70% ${lightness}%)`,
    color: lightness < 55 ? "#ffffff" : "#0f172a",
  };
}
