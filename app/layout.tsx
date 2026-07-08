import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { TopNav } from "@/components/ui";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Case Automation — Seeger Weiss",
  description:
    "Litify-centered document intelligence: OCR, term search, bookmarking, structured extraction, confidence-gated review, and write-back staging. Simulated Litify connection; synthetic records only.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${plexMono.variable}`}>
      <body>
        <TopNav />
        <main className="mx-auto max-w-[1408px] px-8 py-10">{children}</main>
        <footer style={{ background: "var(--gray-50)", borderTop: "1px solid var(--gray-200)" }}>
          <div className="mx-auto flex max-w-[1408px] flex-wrap items-center justify-between gap-4 px-8 py-8">
            <span className="meta">
              Prototype — simulated Litify connection · synthetic records only, every patient and
              provider is fictional
            </span>
            <span className="meta">pipeline v0.1.0</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
