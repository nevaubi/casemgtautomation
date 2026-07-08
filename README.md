# Case Management Automation — Litify Document Intelligence (Prototype)

Seeger Weiss–branded prototype of a Litify-centered document automation layer for
mass-tort medical records: pull PDFs, OCR, term search, highlight + bookmark,
structured extraction, confidence-gated human review, and write-back staging.

**Simulated Litify connection. Synthetic records only** — every patient, provider,
and identifier in `fixtures/` is fictional (each page carries a disclosure footer).

## Architecture

```
GitHub (source of truth)
  ├─ /                  Next.js 16 app (Vercel) — dashboard, work list, workbench,
  │                     review queue, Litify sync + write-back staging
  ├─ /app/api/litify    Mock Litify: Salesforce-shaped SOQL + VersionData endpoints
  ├─ /pipeline          casepipe — code-first processing engine (Python)
  │                     text-layer/OCR words ▸ phrase+fuzzy matching ▸ negation
  │                     ▸ confidence scoring ▸ PyMuPDF highlights + bookmark tree
  └─ /fixtures          synthetic record set + ground_truth.json (eval harness)
```

Design principles carried from the project briefs: Litify stays the system of
record; originals are never modified (enriched output is a new file); routing is
confidence-gated (auto ≥ 0.85, review 0.60–0.85, escalation below / on extractor
disagreement); every step is auditable.

## Pipeline

```bash
pip install -e ./pipeline            # needs tesseract-ocr on PATH
python -m casepipe.run   --input fixtures/records --out out/
python -m casepipe.score --findings out/ --truth fixtures/records/ground_truth.json
```

Current fixture scores (CI-gated): recall 1.000, precision 1.000, 0 negation
violations. These are synthetic fixtures the taxonomy was designed against —
the harness exists so real-record accuracy is measured, not asserted.

Adjust the term taxonomy in `pipeline/casepipe/terms.json` (categories → terms →
variants, negation cues, thresholds). Regenerate UI demo assets by re-running the
pipeline and copying outputs to `public/demo/` (see `public/demo/manifest.json`).

## Web app

```bash
npm install && npm run dev
```

- **Dashboard** — matter banner, KPIs, routing distribution, audit trail
- **Work List** — dense document grid with Salesforce IDs and routing counts
- **Workbench** — enriched-PDF viewer (highlights + outline render natively) with
  findings / bookmarks / extracted-fields panels, page-jump, validate/reject
- **Review Queue** — lowest-confidence-first exception handling
- **Litify Sync** — simulated connection health, SOQL pull log, and write-back
  staging (ContentVersion insert → ContentDocumentLink → field PATCH → Task),
  gated on explicit approval

## Persistence (Supabase)

Findings, review decisions, and audit events live in a Supabase Postgres
(`matters`, `documents`, `findings`, `audit_events`) with Row Level Security:
anonymous read everywhere; anonymous writes limited to review decisions on
`findings` and inserts on `audit_events`. Workbench validate/reject and the
review queue's approve/correct/escalate persist with an audit event and
survive reloads. The static JSON under `public/demo/` remains a read fallback
if the store is unreachable.

The publishable key in `lib/supabase.ts` is intentionally client-safe (RLS is
the enforcement layer) and can be overridden with `NEXT_PUBLIC_SUPABASE_URL`
and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel.

## Roadmap (next slices)

1. Managed Agents escalation worker (code-first, agent second-opinion on
   low-confidence findings; gated behind `ANTHROPIC_API_KEY` env)
2. Real Litify connector behind the same interface as the mock
   (`app/api/litify/*` defines the contract)
3. Adjustable-schema editor backed by a describe()-shaped definition file
4. Supabase Realtime for a live processing board

## Environment

No server secrets required for the demo. Future slices read from env (set in
Vercel): `SUPABASE_SERVICE_ROLE_KEY` (never in the repo), `ANTHROPIC_API_KEY`.
