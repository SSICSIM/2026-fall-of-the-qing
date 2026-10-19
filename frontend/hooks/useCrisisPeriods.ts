"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { crisisPeriodsService } from "@/services/crisisPeriods";
import type { CrisisPeriodCreate } from "@/types/api";

export function usePeriods() {
  return useQuery({
    queryKey: ["periods"],
    queryFn: () => crisisPeriodsService.list(),
  });
}

export function useActivePeriod() {
  return useQuery({
    queryKey: ["periods", "active"],
    queryFn: () => crisisPeriodsService.getActive(),
    retry: false,
  });
}

export function useCreatePeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CrisisPeriodCreate) => crisisPeriodsService.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["periods"] });
      toast.success("Period created.");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to create period."),
  });
}

export function useReopenPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => crisisPeriodsService.reopen(id),
    onSuccess: (period) => {
      qc.invalidateQueries({ queryKey: ["periods"] });
      qc.invalidateQueries({ queryKey: ["notes"] });
      toast.success(`Back to ${period.name}.`);
    },
    onError: (err: Error) => toast.error(err.message || "Failed to reopen period."),
  });
}

export function useDeletePeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => crisisPeriodsService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["periods"] });
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
      qc.invalidateQueries({ queryKey: ["staff-notes"] });
      toast.success("Period deleted.");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to delete period."),
  });
}

export function useArchivePeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => crisisPeriodsService.archive(id),
    onSuccess: (newPeriod) => {
      qc.invalidateQueries({ queryKey: ["periods"] });
      toast.success(`Next round started: ${newPeriod.name}`);
    },
    onError: (err: Error) => toast.error(err.message || "Failed to archive period."),
  });
}
