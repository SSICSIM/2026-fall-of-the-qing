import { apiClient } from "@/lib/apiClient";
import type {
  FactionCreate,
  FactionResponse,
  FormulaResponse,
  FormulaSettings,
  AnnotationCreate,
  AnnotationResponse,
  BulkScoreUpdate,
  ConflictCreate,
  ConflictResolve,
  ConflictResponse,
  DelegateProfileUpdate,
  DelegateResponse,
  EfficiencyRequest,
  EfficiencyResponse,
  HistoryBatchResponse,
  InvasionRequest,
  MapStateResponse,
  PresetCreate,
  PresetResponse,
  ProvinceResponse,
  ProvinceShapeUpdate,
  ProvinceUpdate,
  PublishRequest,
  TerritoryCreate,
  TerritoryResponse,
  TerritoryUpdate,
} from "@/types/api";

export const warRoomService = {
  listDelegates: () => apiClient.get<DelegateResponse[]>("/api/delegates"),
  updateScores: (body: BulkScoreUpdate) =>
    apiClient.patch<DelegateResponse[]>("/api/delegates/scores", body),
  move: (id: number, body: { x: number | null; y: number | null }) =>
    apiClient.patch<DelegateResponse>(`/api/delegates/${id}/position`, body),
  placeMany: (positions: { character_id: number; x: number; y: number }[]) =>
    apiClient.patch<DelegateResponse[]>("/api/delegates/positions", { positions }),
  updateProfile: (id: number, body: DelegateProfileUpdate) =>
    apiClient.patch<DelegateResponse>(`/api/delegates/${id}`, body),
  createFaction: (body: FactionCreate) => apiClient.post<FactionResponse>("/api/factions", body),
  updateFaction: (id: number, body: Partial<FactionCreate>) =>
    apiClient.patch<FactionResponse>(`/api/factions/${id}`, body),
  deleteFaction: (id: number) => apiClient.delete<void>(`/api/factions/${id}`),

  calculate: (body: EfficiencyRequest) =>
    apiClient.post<EfficiencyResponse>("/api/calculator/efficiency", body),
  publish: (body: PublishRequest) =>
    apiClient.post<DelegateResponse[]>("/api/calculator/publish", body),
  getFormula: () => apiClient.get<FormulaResponse>("/api/calculator/formula"),
  updateFormula: (body: FormulaSettings) => apiClient.put<FormulaResponse>("/api/calculator/formula", body),
  resetFormula: () => apiClient.delete<FormulaResponse>("/api/calculator/formula"),
  listPresets: () => apiClient.get<PresetResponse[]>("/api/calculator/presets"),
  createPreset: (body: PresetCreate) =>
    apiClient.post<PresetResponse>("/api/calculator/presets", body),
  deletePreset: (id: number) => apiClient.delete<void>(`/api/calculator/presets/${id}`),

  history: () => apiClient.get<HistoryBatchResponse[]>("/api/history"),
  undo: () => apiClient.post<HistoryBatchResponse>("/api/history/undo", {}),

  mapState: () => apiClient.get<MapStateResponse>("/api/map"),
  updateProvince: (id: string, body: ProvinceUpdate) =>
    apiClient.patch<ProvinceResponse>(`/api/map/provinces/${id}`, body),
  redrawProvince: (id: string, body: ProvinceShapeUpdate) =>
    apiClient.put<ProvinceResponse>(`/api/map/provinces/${id}/shape`, body),
  createTerritory: (body: TerritoryCreate) => apiClient.post<TerritoryResponse>("/api/map/territories", body),
  updateTerritory: (id: number, body: TerritoryUpdate) =>
    apiClient.patch<TerritoryResponse>(`/api/map/territories/${id}`, body),
  returnTerritory: (id: number) => apiClient.delete<void>(`/api/map/territories/${id}`),
  invade: (body: InvasionRequest) => apiClient.post<MapStateResponse>("/api/map/invasions", body),
  createAnnotation: (body: AnnotationCreate) =>
    apiClient.post<AnnotationResponse>("/api/map/annotations", body),
  updateAnnotation: (id: number, body: { label?: string | null; crisis_note_id?: number | null }) =>
    apiClient.patch<AnnotationResponse>(`/api/map/annotations/${id}`, body),
  deleteAnnotation: (id: number) => apiClient.delete<void>(`/api/map/annotations/${id}`),

  createConflict: (body: ConflictCreate) => apiClient.post<ConflictResponse>("/api/conflicts", body),
  resolveConflict: (id: number, body: ConflictResolve) =>
    apiClient.post<ConflictResponse>(`/api/conflicts/${id}/resolve`, body),
  deleteConflict: (id: number) => apiClient.delete<void>(`/api/conflicts/${id}`),
};
