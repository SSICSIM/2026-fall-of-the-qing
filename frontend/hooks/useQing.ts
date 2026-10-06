"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { qingService } from "@/services/qing";
import type { Indicator, PublicScore, ScoreEdit } from "@/types/api";

function errorMessage(err: Error, fallback: string): string {
  // apiClient errors look like: Request failed (409): {"detail":"..."}
  const match = err.message.match(/"detail":"([^"]+)"/);
  return match ? match[1] : err.message || fallback;
}

export function useIndicators() {
  return useQuery({ queryKey: ["indicators"], queryFn: qingService.indicators });
}

export function useEditScores() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { edits: ScoreEdit[]; note?: string }) =>
      qingService.editScores(vars.edits, vars.note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["indicators"] });
      qc.invalidateQueries({ queryKey: ["history"] });
    },
    onError: (err: Error) => toast.error(errorMessage(err, "Could not update scores.")),
  });
}

export function useSetNotes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { characterId: number; notes: string | null }) =>
      qingService.setNotes(vars.characterId, vars.notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["indicators"] });
      toast.success("Notes saved.");
    },
    onError: (err: Error) => toast.error(errorMessage(err, "Could not save notes.")),
  });
}

export function useCreateRun() {
  return useMutation({
    mutationFn: (vars: { characterIds: number[]; indicators?: Indicator[] }) =>
      qingService.createRun(vars.characterIds, vars.indicators),
    onError: (err: Error) => toast.error(errorMessage(err, "Could not calculate.")),
  });
}

export function usePublishRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: number) => qingService.publishRun(runId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["indicators"] });
      qc.invalidateQueries({ queryKey: ["history"] });
      toast.success("Sent to the map.");
    },
    onError: (err: Error) => toast.error(errorMessage(err, "Could not send to the map.")),
  });
}

export function useHistory() {
  return useQuery({ queryKey: ["history"], queryFn: qingService.history });
}

export function useUndo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => qingService.undo(),
    onSuccess: (action) => {
      qc.invalidateQueries({ queryKey: ["indicators"] });
      qc.invalidateQueries({ queryKey: ["history"] });
      toast.success(action.kind === "PUBLISH" ? "Map update undone." : "Score change undone.");
    },
    onError: (err: Error) => toast.error(errorMessage(err, "Nothing to undo.")),
  });
}

export function useGroups() {
  return useQuery({ queryKey: ["groups"], queryFn: qingService.groups });
}

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { name: string; characterIds: number[] }) =>
      qingService.createGroup(vars.name, vars.characterIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["groups"] });
      toast.success("Group saved.");
    },
    onError: (err: Error) => toast.error(errorMessage(err, "Could not save group.")),
  });
}

export function useDeleteGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => qingService.deleteGroup(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["groups"] }),
    onError: (err: Error) => toast.error(errorMessage(err, "Could not delete group.")),
  });
}

/** Delegate-facing display data. No auth: goes through the public proxy route. */
export function usePublicScores() {
  return useQuery({
    queryKey: ["public-scores"],
    queryFn: async (): Promise<PublicScore[]> => {
      const res = await fetch("/api/public/map-scores", { cache: "no-store" });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      return res.json();
    },
    refetchInterval: 5000,
  });
}
