// Colours for the war map: flat, clearly distinct faction colours and a
// sequential ramp for score overlays (light = low, dark blue = high).

export const FACTION_PALETTE = [
  "#d9432f", // red
  "#6b8e3a", // green
  "#e0b44f", // yellow
  "#5e5687", // purple
  "#c97a2b", // orange
  "#4f86c6", // blue
  "#b5539f", // magenta
  "#9b7a4c", // brown
  "#3e8a6a", // teal
  "#c25b7a", // pink
  "#2fa4a8", // cyan
  "#3f5f8f", // navy
]

export const UNCLAIMED_FILL = "#c9c9c9";

export function factionColor(delegate: { id: number; color: string | null }): string {
  return delegate.color ?? FACTION_PALETTE[delegate.id % FACTION_PALETTE.length];
}

const RAMP_LOW = [0xee, 0xf3, 0xf8];
const RAMP_MID = [0x7f, 0xa7, 0xc9];
const RAMP_HIGH = [0x1f, 0x3a, 0x5f];

function hex(rgb: number[]): string {
  return "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

/** Map t ∈ [0, 1] onto near-white → mid blue → deep navy. */
export function rampColor(t: number): string {
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  const [from, to, local] = x < 0.5 ? [RAMP_LOW, RAMP_MID, x * 2] : [RAMP_MID, RAMP_HIGH, (x - 0.5) * 2];
  return hex(from.map((c, i) => c + (to[i] - c) * local));
}

/** Readable ink for text drawn on top of a fill. */
export function inkFor(fill: string): string {
  const n = parseInt(fill.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#2b1d0e" : "#f6eedb";
}
