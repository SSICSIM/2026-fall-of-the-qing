"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useMemo } from "react";

import { DEFAULT_FORMULA, type Formula } from "@/lib/warRoom/efficiency";
import { provinceNames } from "@/lib/warRoom/provinces";
import { warRoomService } from "@/services/warRoom";
import type {
  AnnotationCreate,
  BulkScoreUpdate,
  ConflictCreate,
  ConflictResolve,
  DelegateProfileUpdate,
  DelegateResponse,
  FactionCreate,
  FormulaResponse,
  FormulaSettings,
  InvasionRequest,
  MapStateResponse,
  PresetCreate,
  ProvinceCreate,
  ProvinceShapeUpdate,
  ProvinceUpdate,
  PublishRequest,
  TerritoryCreate,
  TerritoryUpdate,
} from "@/types/api";

// Anything that changes scores or the map can affect every war-room view.
const WAR_ROOM_KEYS = [["delegates"], ["map"], ["history"]] as const;

function useInvalidateWarRoom() {
  const qc = useQueryClient();
  return () => WAR_ROOM_KEYS.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
}

export function useDelegates() {
  return useQuery({ queryKey: ["delegates"], queryFn: () => warRoomService.listDelegates() });
}

// The projected map polls so it picks up changes confirmed from the calculator
// on another machine.
/** Province names by id, including provinces staff added. */
export function useProvinceNames(): Record<string, string> {
  const { data } = useMapState(0);
  return useMemo(() => provinceNames(data?.provinces ?? []), [data]);
}

export function useMapState(pollMs = 5000) {
  return useQuery({
    queryKey: ["map"],
    queryFn: () => warRoomService.mapState(),
    refetchInterval: pollMs,
  });
}

// Polls like the map, so "Undo last" names the right change even when
// another staff member made it.
export function useHistory() {
  return useQuery({ queryKey: ["history"], queryFn: () => warRoomService.history(), refetchInterval: 5000 });
}

function toFormula(f: FormulaResponse): Formula & { isDefault: boolean } {
  return {
    midpoint: f.midpoint,
    bands: f.bands.map((b, i) => ({ key: b.key || `band-${i}`, label: b.label, tone: b.tone, tips: b.tips, min: b.min_rating })),
    isDefault: f.is_default,
  };
}

/** The formula every calculator view uses: staff edits if saved, else the PRD's. */
export function useFormula(): Formula & { isDefault: boolean } {
  const { data } = useQuery({ queryKey: ["formula"], queryFn: () => warRoomService.getFormula() });
  return useMemo(() => (data ? toFormula(data) : { ...DEFAULT_FORMULA, isDefault: true }), [data]);
}

export function useUpdateFormula() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: FormulaSettings) => warRoomService.updateFormula(body),
    onSuccess: (data) => {
      qc.setQueryData(["formula"], data);
      toast.success("Formula saved.");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to save the formula."),
  });
}

export function useResetFormula() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => warRoomService.resetFormula(),
    onSuccess: (data) => {
      qc.setQueryData(["formula"], data);
      toast.success("Formula reset to the PRD.");
    },
  });
}

export function usePresets() {
  return useQuery({ queryKey: ["presets"], queryFn: () => warRoomService.listPresets() });
}

export function useUpdateScores() {
  const invalidate = useInvalidateWarRoom();
  return useMutation({
    mutationFn: (body: BulkScoreUpdate) => warRoomService.updateScores(body),
    onSuccess: () => {
      invalidate();
      toast.success("Scores recorded.");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to update scores."),
  });
}

export function useUpdateProfile() {
  const invalidate = useInvalidateWarRoom();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: DelegateProfileUpdate }) =>
      warRoomService.updateProfile(id, body),
    onSuccess: () => invalidate(),
    onError: (err: Error) => toast.error(err.message || "Failed to save."),
  });
}

export function useCreateFaction() {
  const invalidate = useInvalidateWarRoom();
  return useMutation({
    mutationFn: (body: FactionCreate) => warRoomService.createFaction(body),
    onSuccess: () => invalidate(),
    onError: (err: Error) => toast.error(err.message || "Failed to add the faction."),
  });
}

export function useUpdateFaction() {
  const invalidate = useInvalidateWarRoom();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<FactionCreate> }) => warRoomService.updateFaction(id, body),
    onSuccess: () => invalidate(),
    onError: (err: Error) => toast.error(err.message || "Failed to save the faction."),
  });
}

export function useDeleteFaction() {
  const invalidate = useInvalidateWarRoom();
  return useMutation({
    mutationFn: (id: number) => warRoomService.deleteFaction(id),
    onSuccess: () => {
      invalidate();
      toast.success("Faction removed. Its members are now unaffiliated.");
    },
  });
}

export function usePublish() {
  const qc = useQueryClient();
  const invalidate = useInvalidateWarRoom();
  return useMutation({
    mutationFn: (body: PublishRequest) => warRoomService.publish(body),
    onSuccess: (published) => {
      // Show the new ratings straight away rather than after the refetch.
      const byId = new Map(published.map((d) => [d.id, d]));
      const merge = (list: DelegateResponse[]) => list.map((d) => byId.get(d.id) ?? d);
      qc.setQueryData<MapStateResponse>(["map"], (old) => old && { ...old, delegates: merge(old.delegates) });
      qc.setQueryData<DelegateResponse[]>(["delegates"], (old) => old && merge(old));
      invalidate();
      toast.success("Efficiency sent to the map.");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to send to map."),
  });
}

export function useUndo() {
  const invalidate = useInvalidateWarRoom();
  return useMutation({
    mutationFn: () => warRoomService.undo(),
    onSuccess: (batch) => {
      invalidate();
      toast.success(`Undone: ${batch.summary}`);
    },
    onError: (err: Error) => toast.error(err.message.includes("409") ? "Nothing to undo." : err.message),
  });
}

export function useCreatePreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PresetCreate) => warRoomService.createPreset(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["presets"] });
      toast.success("Preset saved.");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to save preset."),
  });
}

export function useDeletePreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => warRoomService.deletePreset(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["presets"] }),
    onError: (err: Error) => toast.error(err.message || "Failed to delete preset."),
  });
}

export function useUpdateProvince() {
  const invalidate = useInvalidateWarRoom();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ProvinceUpdate }) =>
      warRoomService.updateProvince(id, body),
    onSuccess: () => invalidate(),
    onError: (err: Error) => toast.error(err.message || "Failed to update province."),
  });
}

export function useInvade() {
  const invalidate = useInvalidateWarRoom();
  return useMutation({
    mutationFn: (body: InvasionRequest) => warRoomService.invade(body),
    onSuccess: () => {
      invalidate();
      toast.success("Invasion recorded on the map.");
    },
    onError: (err: Error) => toast.error(err.message || "Invasion failed."),
  });
}

export function useCreateAnnotation() {
  const invalidate = useInvalidateWarRoom();
  return useMutation({
    mutationFn: (body: AnnotationCreate) => warRoomService.createAnnotation(body),
    onSuccess: () => invalidate(),
    onError: (err: Error) => toast.error(err.message || "Failed to save drawing."),
  });
}

export function useDeleteAnnotation() {
  const invalidate = useInvalidateWarRoom();
  return useMutation({
    mutationFn: (id: number) => warRoomService.deleteAnnotation(id),
    onSuccess: () => invalidate(),
    onError: (err: Error) => toast.error(err.message || "Failed to erase."),
  });
}

export function useMoveCharacter() {
  const invalidate = useInvalidateWarRoom();
  return useMutation({
    mutationFn: ({ id, x, y }: { id: number; x: number | null; y: number | null }) =>
      warRoomService.move(id, { x, y }),
    onSuccess: () => invalidate(),
    onError: (err: Error) => toast.error(err.message || "Failed to move character."),
  });
}

export function usePlaceMany() {
  const invalidate = useInvalidateWarRoom();
  return useMutation({
    mutationFn: (positions: { character_id: number; x: number; y: number }[]) => warRoomService.placeMany(positions),
    onSuccess: (placed) => {
      invalidate();
      toast.success(`${placed.length} character${placed.length === 1 ? "" : "s"} placed. Undo puts them back.`);
    },
    onError: (err: Error) => toast.error(err.message || "Failed to place characters."),
  });
}

export function useCreateConflict() {
  const invalidate = useInvalidateWarRoom();
  return useMutation({
    mutationFn: (body: ConflictCreate) => warRoomService.createConflict(body),
    onSuccess: () => {
      invalidate();
      toast.success("Conflict started.");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to start conflict."),
  });
}

export function useResolveConflict() {
  const invalidate = useInvalidateWarRoom();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: ConflictResolve }) => warRoomService.resolveConflict(id, body),
    onSuccess: () => {
      invalidate();
      toast.success("Conflict resolved.");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to resolve conflict."),
  });
}

export function useDeleteConflict() {
  const invalidate = useInvalidateWarRoom();
  return useMutation({
    mutationFn: (id: number) => warRoomService.deleteConflict(id),
    onSuccess: () => invalidate(),
    onError: (err: Error) => toast.error(err.message || "Failed to delete conflict."),
  });
}


export function useRedrawProvince() {
  const invalidate = useInvalidateWarRoom();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ProvinceShapeUpdate }) => warRoomService.redrawProvince(id, body),
    onSuccess: (_, { body }) => {
      invalidate();
      toast.success(body.shape ? "Border redrawn." : "Original border restored.");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to save the border."),
  });
}

export function useAddProvince() {
  const invalidate = useInvalidateWarRoom();
  return useMutation({
    mutationFn: (body: ProvinceCreate) => warRoomService.addProvince(body),
    onSuccess: (p) => {
      invalidate();
      toast.success(`${p.name} added. Undo removes it.`);
    },
    onError: (err: Error) => toast.error(err.message.includes("409") ? "A province with that name already exists." : err.message || "Failed to add the province."),
  });
}

export function useRemoveProvince() {
  const invalidate = useInvalidateWarRoom();
  return useMutation({
    mutationFn: (id: string) => warRoomService.removeProvince(id),
    onSuccess: () => {
      invalidate();
      toast.success("Province removed. Undo brings it back.");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to remove the province."),
  });
}

export function useUpdateTerritory() {
  const invalidate = useInvalidateWarRoom();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: TerritoryUpdate }) => warRoomService.updateTerritory(id, body),
    onSuccess: () => {
      invalidate();
      toast.success("Territory updated.");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to update territory."),
  });
}

export function useReturnTerritory() {
  const invalidate = useInvalidateWarRoom();
  return useMutation({
    mutationFn: (id: number) => warRoomService.returnTerritory(id),
    onSuccess: () => {
      invalidate();
      toast.success("Territory handed back. Undo brings it back.");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to return territory."),
  });
}

export function useCreateTerritory() {
  const invalidate = useInvalidateWarRoom();
  return useMutation({
    mutationFn: (body: TerritoryCreate) => warRoomService.createTerritory(body),
    onSuccess: () => {
      invalidate();
      toast.success("Territory recorded.");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to record territory."),
  });
}
