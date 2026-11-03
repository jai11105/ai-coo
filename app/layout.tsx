import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProviders } from "@/components/providers";
import { AppShell } from "@/components/app-shell";
import { BusinessGate } from "@/components/business-gate";

export const metadata: Metadata = {
  title: "AI Powered COO",
  description: "Decision-first view of business performance: dashboard, ledger, rapid log entry and COO Copilot.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "AI COO", statusBarStyle: "default" },
  icons: { icon: "/icon-192.svg", apple: "/apple-touch-icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#1d4ed8",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AppProviders>
          <AppShell>
            <BusinessGate>{children}</BusinessGate>
          </AppShell>
        </AppProviders>
      </body>
    </html>
  );
}
