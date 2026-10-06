"use client";

import { usePublicScores } from "@/hooks/useQing";
import { efficiencyShade, fmt } from "@/utils/qing";

// Delegate-facing display. Intentionally public (see middleware.ts) and it only ever
// receives names and published efficiency scores. The province map will replace this
// grid once the map geometry exists; the data source stays the same.
export default function DisplayPage() {
  const { data, isLoading, isError } = usePublicScores();

  return (
    <main className="min-h-screen bg-slate-50 p-8 text-slate-900">
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Efficiency</h1>
      {isError && <p className="text-sm text-red-600">Cannot reach the server. Retrying...</p>}
      {isLoading ? null : !data || data.length === 0 ? (
        <p className="text-slate-500">No scores have been announced yet.</p>
      ) : (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(14rem,1fr))]">
          {data.map((s) => (
            <div
              key={s.character_id}
              className="rounded-xl p-5 shadow-sm"
              style={efficiencyShade(s.efficiency)}
            >
              <div className="text-lg font-semibold">{s.name}</div>
              <div className="text-5xl font-bold tabular-nums">{fmt(s.efficiency)}</div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
