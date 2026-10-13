// Client-side mirror of backend/app/services/efficiency.py so the calculator
// can preview ratings instantly while scores are still being edited. The
// backend recomputes on publish; keep the two in sync (both have tests
// pinning the same thresholds).
import type { BandResponse, Indicator } from "@/types/api";

export const INDICATORS: Indicator[] = ["reputation", "economics", "military"];

export const INDICATOR_LABELS: Record<Indicator, string> = {
  reputation: "Legitimacy/Reputation",
  economics: "Economics",
  military: "Military",
};

export const INDICATOR_SHORT: Record<Indicator, string> = {
  reputation: "L",
  economics: "E",
  military: "M",
};

export const SCORE_MAX = 5;
export const MIDPOINT = 2.5;

export type Scores = Record<Indicator, number>;

export interface Band extends BandResponse {
  min: number;
}

/** The formula's parameters: the divisor and the bands, worst first. */
export interface Formula {
  midpoint: number;
  bands: Band[];
}

// The product requirement document's efficiency thresholds, worst to best.
export const BANDS: Band[] = [
  {
    key: "consequences",
    label: "Can give consequences",
    tone: "bad",
    min: 0,
    tips: ["Larger casualties", "Larger expenditure", "Loss of leadership", "Loses battle"],
  },
  {
    key: "minor",
    label: "Can give minor consequence",
    tone: "neutral",
    min: 0.5,
    tips: ["More casualties", "Morale loss"],
  },
  {
    key: "benefits",
    label: "Can give benefits",
    tone: "good",
    min: 1.5,
    tips: ["Morale loss for the opponent", "Seizes enemy equipment", "Wins battle"],
  },
];

export const DEFAULT_FORMULA: Formula = { midpoint: MIDPOINT, bands: BANDS };

export function bandFor(rating: number, bands: Band[] = BANDS): Band {
  let chosen = bands[0];
  for (const band of bands) if (rating >= band.min) chosen = band;
  return chosen;
}

export function normalizeIndicators(indicators: Indicator[] | undefined): Indicator[] {
  if (!indicators || indicators.length === 0) return [...INDICATORS];
  return INDICATORS.filter((i) => indicators.includes(i));
}

/** ⁿ√(Π indicator/midpoint): square root for two indicators, cube root for three. */
export function delegateEfficiency(scores: Scores, indicators?: Indicator[], midpoint = MIDPOINT): number {
  const chosen = normalizeIndicators(indicators);
  const product = chosen.reduce((p, i) => p * (scores[i] / midpoint), 1);
  return product ** (1 / chosen.length);
}

export function groupEfficiency(delegates: Scores[], indicators?: Indicator[], midpoint = MIDPOINT): number | null {
  if (delegates.length === 0) return null;
  const ratings = delegates.map((d) => delegateEfficiency(d, indicators, midpoint));
  return ratings.reduce((a, b) => a + b, 0) / ratings.length;
}

/** The highest rating the formula can give (every score at 5). */
export const maxRating = (formula: Formula) => SCORE_MAX / formula.midpoint;

/** Efficiency × absolute strength — who wins when two forces meet. */
export function compareForces(
  a: { efficiency: number; strength: number },
  b: { efficiency: number; strength: number },
): { a: number; b: number; winner: "a" | "b" | "tie"; margin: number } {
  const ea = a.efficiency * a.strength;
  const eb = b.efficiency * b.strength;
  const winner = Math.abs(ea - eb) < 1e-9 ? "tie" : ea > eb ? "a" : "b";
  const margin = Math.max(ea, eb) === 0 ? 0 : Math.abs(ea - eb) / Math.max(ea, eb);
  return { a: ea, b: eb, winner, margin };
}

export function clampScore(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(SCORE_MAX, Math.max(0, value));
}

export const formatRating = (value: number | null | undefined) =>
  value == null ? "—" : value.toFixed(2);
