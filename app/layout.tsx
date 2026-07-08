import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { TopNav } from "@/components/ui";

const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
});
const serifBrand = Source_Serif_4({
  subsets: ["latin"],
  weight: ["600"],
  variable: "--font-serif-brand",
});

export const metadata: Metadata = {
  title: "Case Automation — Seeger Weiss",
  description:
    "Litify-centered document intelligence: OCR, term search, bookmarking, structured extraction, confidence-gated review, and write-back staging. Simulated Litify connection; synthetic records only.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plex.variable} ${plexMono.variable} ${serifBrand.variable}`}>
      <body>
        <TopNav />
        <main className="mx-auto max-w-[1440px] px-6 py-6">{children}</main>
        <footer
          className="mx-auto max-w-[1440px] px-6 pb-8 pt-2 text-[12px]"
          style={{ color: "var(--faint)" }}
        >
          Prototype · simulated Litify connection · synthetic records only — every patient and
          provider is fictional · pipeline v0.1.0
        </footer>
      </body>
    </html>
  );
}
