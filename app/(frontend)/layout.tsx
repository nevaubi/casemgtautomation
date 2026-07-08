import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import "../globals.css";
import { AppShell } from "@/components/sidebar-layout/sidebar-layout";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Case Automation — Seeger Weiss",
  description:
    "Litify-centered document intelligence: OCR, term search, bookmarking, structured extraction, confidence-gated review, and write-back staging. Simulated Litify connection; synthetic records only.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
