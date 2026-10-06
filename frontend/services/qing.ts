import { apiClient } from "@/lib/apiClient";
import type {
  ActionResponse,
  DelegateGroup,
  IndicatorRow,
  Indicator,
  RunResponse,
  ScoreEdit,
} from "@/types/api";

export const qingService = {
  indicators: () => apiClient.get<IndicatorRow[]>("/api/indicators"),
  editScores: (edits: ScoreEdit[], note?: string) =>
    apiClient.post<ActionResponse>("/api/indicators/edits", { edits, note: note ?? null }),
  setNotes: (characterId: number, notes: string | null) =>
    apiClient.put<{ notes: string | null }>(`/api/indicators/${characterId}/notes`, { notes }),

  createRun: (characterIds: number[], indicators?: Indicator[]) =>
    apiClient.post<RunResponse>("/api/calculator/runs", {
      character_ids: characterIds,
      ...(indicators && indicators.length ? { indicators } : {}),
    }),
  publishRun: (runId: number) =>
    apiClient.post<ActionResponse>(`/api/calculator/runs/${runId}/publish`, {}),

  history: () => apiClient.get<ActionResponse[]>("/api/history"),
  undo: () => apiClient.post<ActionResponse>("/api/history/undo", {}),

  groups: () => apiClient.get<DelegateGroup[]>("/api/groups"),
  createGroup: (name: string, characterIds: number[]) =>
    apiClient.post<DelegateGroup>("/api/groups", { name, character_ids: characterIds }),
  deleteGroup: (id: number) => apiClient.delete<void>(`/api/groups/${id}`),
};
