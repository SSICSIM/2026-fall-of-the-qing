"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CharacterManagerDialog } from "@/components/crisis/CharacterManagerDialog";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Crisis Tracker" },
  { href: "/map", label: "Map" },
  { href: "/calculator", label: "Calculator" },
];

export function Navbar() {
  const [charOpen, setCharOpen] = useState(false);
  const pathname = usePathname();

  // The map is full-screen and carries its own navigation.
  if (pathname.startsWith("/map")) return null;

  return (
    <>
      <header className="bg-background/95 sticky top-0 z-40 border-b backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <nav className="flex items-center gap-5 text-sm">
            {LINKS.map((l) => {
              const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={cn(active ? "font-semibold tracking-tight" : "text-muted-foreground hover:text-foreground")}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>
          <Button variant="outline" size="sm" onClick={() => setCharOpen(true)}>
            <Users className="mr-2 h-4 w-4" />
            Characters
          </Button>
        </div>
      </header>
      <CharacterManagerDialog open={charOpen} onOpenChange={setCharOpen} />
    </>
  );
}
