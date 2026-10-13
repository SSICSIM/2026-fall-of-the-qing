import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "./globals.css";
import { Providers } from "./providers";
import { Navbar } from "@/components/Navbar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Matches font.family.body/heading ("Inter") from the Figma tokens.
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  // Tab title is the committee name; pages with their own title show as
  // "<page> | <committee>".
  title: { default: "Fall of the Qing: Five Coloured Banners Over Jing", template: "%s | Fall of the Qing: Five Coloured Banners Over Jing" },
  description: "Fall of the Qing: Five Coloured Banners Over Jing crisis staff workspace.",
  icons: { icon: "/favicon.png", apple: "/favicon-apple.png" },
};

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", inter.variable)}>
      <body className="min-h-screen">
        <Providers>
          <TooltipProvider>
            <Navbar />
            {props.children}
            <Toaster />
          </TooltipProvider>
        </Providers>
      </body>
    </html>
  );
}
