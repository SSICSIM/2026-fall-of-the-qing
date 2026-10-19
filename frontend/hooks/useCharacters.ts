"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { charactersService } from "@/services/characters";
import type { CharacterCreate } from "@/types/api";

export function useCharacters() {
  return useQuery({
    queryKey: ["characters"],
    queryFn: () => charactersService.list(),
  });
}

export function useCreateCharacter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CharacterCreate) => charactersService.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["characters"] });
      qc.invalidateQueries({ queryKey: ["delegates"] });
      qc.invalidateQueries({ queryKey: ["map"] });
      toast.success("Character added.");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to add character."),
  });
}

export function useDeleteCharacter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => charactersService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["characters"] });
      qc.invalidateQueries({ queryKey: ["delegates"] });
      qc.invalidateQueries({ queryKey: ["map"] });
      toast.success("Character removed.");
    },
    onError: (err: Error) => toast.error(err.message || "Cannot delete character."),
  });
}

export function useBulkUploadCharacters() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => charactersService.bulkUpload(file),
    onSuccess: ({ created, skipped, unknown_provinces }) => {
      qc.invalidateQueries({ queryKey: ["characters"] });
      qc.invalidateQueries({ queryKey: ["delegates"] });
      qc.invalidateQueries({ queryKey: ["map"] });
      toast.success(`Imported ${created} character${created !== 1 ? "s" : ""}${skipped ? `, ${skipped} skipped (duplicate)` : ""}.`);
      if (unknown_provinces.length) {
        toast.warning(`No province matched for ${unknown_provinces.join("; ")}. Those characters were added without a home.`);
      }
    },
    onError: (err: Error) => toast.error(err.message || "Upload failed."),
  });
}
