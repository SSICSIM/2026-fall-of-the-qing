"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useEffect, useRef } from "react";

import { apiClient } from "@/lib/apiClient";

/**
 * Keeps every open screen current: the backend's revision changes whenever
 * anyone saves anything, and when it does, everything is refetched — so a
 * change made on another machine shows up within a couple of seconds, even
 * on a projector tab nobody is touching.
 */
export function useLiveSync(pollMs = 1500) {
  const qc = useQueryClient();
  const { status } = useSession();
  const { data } = useQuery({
    queryKey: ["sync"],
    queryFn: () => apiClient.get<{ revision: string }>("/api/sync"),
    refetchInterval: pollMs,
    refetchIntervalInBackground: true,
    enabled: status === "authenticated",
  });
  const seen = useRef<string | null>(null);

  useEffect(() => {
    if (!data) return;
    if (seen.current !== null && seen.current !== data.revision) {
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "sync" });
    }
    seen.current = data.revision;
  }, [data, qc]);
}
