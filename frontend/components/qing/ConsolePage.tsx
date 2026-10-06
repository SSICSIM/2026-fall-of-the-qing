"use client";

import { Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHistory, useUndo } from "@/hooks/useQing";
import { CalculatorTab } from "./CalculatorTab";
import { HistoryTab } from "./HistoryTab";
import { ScoresTab } from "./ScoresTab";

export function ConsolePage() {
  const { data: history } = useHistory();
  const { mutate: undo, isPending } = useUndo();
  const canUndo = (history ?? []).some((a) => a.reverted_at === null);

  return (
    <main className="page-shell space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Backroom Console</h1>
          <p className="text-muted-foreground text-sm">
            Delegate scores and the efficiency calculator. Staff only. Delegates see the{" "}
            <a href="/display" target="_blank" rel="noreferrer" className="underline">
              display
            </a>
            .
          </p>
        </div>
        <Button variant="outline" onClick={() => undo()} disabled={!canUndo || isPending}>
          <Undo2 className="mr-2 h-4 w-4" />
          Undo last
        </Button>
      </div>

      <Tabs defaultValue="calculator" className="space-y-4">
        <TabsList>
          <TabsTrigger value="calculator">Calculator</TabsTrigger>
          <TabsTrigger value="scores">Delegates</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="calculator" className="mt-0">
          <CalculatorTab />
        </TabsContent>
        <TabsContent value="scores" className="mt-0">
          <ScoresTab />
        </TabsContent>
        <TabsContent value="history" className="mt-0">
          <HistoryTab />
        </TabsContent>
      </Tabs>
    </main>
  );
}
