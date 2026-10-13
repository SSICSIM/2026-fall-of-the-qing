"use client";

import { cn } from "@/lib/utils";

// Shared sidebar pieces, matching the Middle-earth map's sidebar
// (2026-lotr/frontend/components/map/parts.tsx).

/** Bold sidebar section title, with an optional control on the right. */
export function SectionHeading({
  title,
  children,
  className,
}: {
  title: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-7 items-center justify-between gap-2", className)}>
      <h2 className="text-lg leading-7 font-semibold tracking-tight">{title}</h2>
      {children}
    </div>
  );
}

/** One row of a bordered settings list: label + hint left, control right. */
export function SettingRow({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-3.5 py-3">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </label>
        {hint ? <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** Dashed placeholder box, e.g. "Select a province". */
export function EmptyHint({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="text-muted-foreground flex items-center gap-3 rounded-lg border border-dashed px-4 py-5 text-xs">
      {icon}
      {children}
    </div>
  );
}

/** Pill row of mutually exclusive options, like the map's view toggle. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: React.ReactNode; title?: string }[];
  label?: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("bg-background flex gap-1 rounded-lg p-1 shadow-md", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === o.value ? "bg-accent text-accent-foreground" : "hover:bg-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
