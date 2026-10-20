"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { useState } from "react";

import { useLiveSync } from "@/hooks/useLiveSync";

function LiveSync() {
  useLiveSync();
  return null;
}

export function Providers(props: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <LiveSync />
        {props.children}
      </QueryClientProvider>
    </SessionProvider>
  );
}
