import type { Metadata } from "next";
import "./globals.css";
import { TopNav } from "@/components/ui";

export const metadata: Metadata = {
  title: "Case Management Automation — Seeger Weiss (Prototype)",
  description:
    "Litify-centered document intelligence prototype: OCR, term search, bookmarking, structured extraction, and write-back staging. Simulated Litify connection; synthetic records only.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TopNav />
        <main className="px-4 py-4 max-w-[1500px] mx-auto">{children}</main>
        <footer className="px-4 py-6 text-center text-[11px]" style={{ color: "var(--sw-muted)" }}>
          Prototype — simulated Litify connection · synthetic test records only · fictional patients and providers ·
          pipeline v0.1.0
        </footer>
      </body>
    </html>
  );
}
