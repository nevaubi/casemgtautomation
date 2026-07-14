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

## Record extraction (Claude Sonnet 5)

The term matcher above proves that a term *appears* in a document. A Plaintiff
Fact Sheet needs more than that: it needs the dose, the route, the prescriber,
the date the drug was actually injected, the ICD-10 code, the test that
confirmed the diagnosis. Those are fields, not keyword hits, so a second stage
extracts them.

```bash
export ANTHROPIC_API_KEY=...
python -m casepipe.extract_records --input fixtures/records --out public/demo \
       --save-raw fixtures/extractions
python pipeline/emit_records_sql.py        # regenerate the Supabase seed
```

One Sonnet call per document. The model sees page-tagged text — the same word
stream the matcher sees, text layer or OCR — and returns records through a tool
schema. It never sees the PDF, so it cannot read anything the OCR did not
produce.

**Nothing the model says is trusted on its word.** Every record must carry a
`quote` copied verbatim from the page it cites. `casepipe/records.py` then tries
to locate that quote in the page word stream:

- **not found → the record is discarded**, and counted. This is the
  hallucination rate, and it is reported rather than hidden (`rejected` in every
  `*.records.json`, and on screen in Upload & Process).
- **found →** the span gives us the highlight rects for free, and the OCR
  confidence of the words actually quoted.

Confidence reuses the matcher's formula so both stages route on one scale:

```
confidence = model_certainty × grounding × page_ocr_confidence × source_factor
             auto ≥ 0.85   ·   review ≥ 0.60   ·   else escalated
```

A clean text-layer page scores ~0.96 and auto-accepts. The 47%-confidence
urgent-care fax scores ~0.43 and escalates — every record on it, regardless of
how sure the model claims to be. The model is not permitted to be confident
about text the OCR could not read.

Current fixtures: **103 records grounded, 0 ungrounded** across 6 documents
(79 auto / 16 review / 8 escalated). Raw model output is committed to
`fixtures/extractions/`, so `--raw` replays a run with no API call — grounding,
scoring, and routing changes are reviewable without re-billing, and CI can gate
on them.

**Sonnet 5 API notes.** No sampling parameters are sent: `temperature`, `top_p`
and `top_k` return a 400 on this model. That costs nothing here — reproducibility
in this pipeline never came from `temperature`, it comes from grounding. Whatever
the model samples, a record the page cannot support is dropped. Adaptive thinking
is on by default and counts against `max_tokens` (a hard limit on thinking *plus*
output), so the budget is sized for both, and `effort` is set explicitly to
`medium` rather than inheriting the `high` default — on Sonnet 5 that is roughly
Sonnet 4.6 at high, which is the right trade for a bounded extraction task whose
output is verified downstream anyway.

`pipeline/casepipe/record_spec.json` is the single source of truth for the
model, the prompt, the tool schema, and the thresholds. Both runtimes import it:
the Python batch pipeline and `app/api/extract-records` (the live route behind
Upload & Process). `lib/record-grounding.ts` is a port of `records.py` and is
verified to reproduce its numbers exactly — same relationship
`lib/client-pipeline.ts` has to `match.py`.

## Case profile — draft Plaintiff Fact Sheet

`/profile` aggregates every record across every document into the PFS sections a
paralegal would otherwise fill in by hand: identity, exposure, administration
log, diagnosis timeline, causation, treatment, providers, ruled-out findings.

Three rules hold the page together:

1. **Nothing is asserted without a citation.** Every field links back to the
   document, page, and verbatim quote it came from, with its confidence.
2. **Nothing is silently chosen.** When two documents disagree — Depo-Provera's
   last injection (07/19/2022) versus its formal discontinuation (01/05/2023) —
   both values are surfaced as a conflict. The tool does not pick a winner
   behind the reviewer's back. Cosmetic differences ("PO" vs "oral tablet",
   "S. Grant, DO" vs "Grant, Sofia DO") are reconciled silently, because a flag
   that cries wolf is worse than no flag.
3. **Nothing rejected survives.** Field-level approve/reject writes through to
   every record backing that field and is excluded from the export.

The `.docx` export is a draft PFS with a **"Verification required before
filing"** appendix — every low-confidence extraction and every unresolved source
conflict, listed for a human. Export writes an audit event.

## Settlement grid (deterministic scoring)

Mass tort cases are not valued one at a time. When an MDL resolves globally, a
special master applies a **point matrix** — exposure duration, diagnostic
confirmation, permanence, confounders — and each plaintiff lands in an award
tier. Firms with thousands of inventory cases live and die by how accurately and
how early they can place each client on that grid, and today that placement is
done by hand, months late, by paralegals reading charts.

`/grid` does it from the extracted records, and it is the only surface in this
app where a **model is not allowed anywhere near the decision**:

```
evaluate(records, matrix_version) -> scorecard      // pure function
```

Same records, same matrix version, same points, every time. The LLM extracts
fields and writes prose. `pipeline/casepipe/matrix.json` — gates, scored factors
with bands, tiers — decides. A score a language model produced is not something a
special master, a lien administrator, or a firm allocating settlement funds will
accept, and it should not be.

Three rules carry over from the extraction stage:

1. **No point without a citation.** A factor that cannot name the record, page,
   and quote behind it does not score.
2. **INDETERMINATE is a first-class answer** — and it is the useful one. It is
   what tells the firm what to go and get.
3. **Confidence gates apply to money too.** A factor whose only support is
   low-confidence, unreviewed OCR text is WITHHELD, not guessed.

On the seeded Whitfield file the engine returns **110 points, Tier 2** — with a
ceiling of 145 (Tier 1). The gap is two unresolved factors, and the page ranks
them by what they are worth:

| Missing evidence | Worth | Why it cannot be answered now |
|---|---|---|
| PCP records for the 12 months before first exposure | up to 25 pts | Earliest record in the file is dated the day of the first injection. Absence cannot be proved from records that do not exist. |
| Neuro-ophthalmology exam ≥6 months post-diagnosis | up to 20 pts | The most recent exam is 1 month post-diagnosis. Permanence cannot be established that early, whatever the exam shows. |

That table is a paralegal work queue sorted by dollar impact, generated from the
chart. Two factors are also scored from data the rest of the industry throws
away: *secondary causes excluded on neuroimaging* is scored from a **negative**
finding (no venous sinus thrombosis on MRV — the exclusion is the evidence), and
the obesity confounder is scored from a **normal** BMI, which in an intracranial
hypertension case removes the defence's first move.

### The matrix weighs its own evidence

Points are what the matrix says a fact is *worth*. They say nothing about whether
you can make it stick. A diagnostic confirmation resting on one page of one
document is not the same asset as an exposure history corroborated across three
facilities — and the difference is exactly what opposing counsel is looking for.

So every factor is scored twice:

```
strength = extraction_confidence × corroboration × provenance × contested
adjusted = points × strength           (positive points only)
```

Multiplicative, every term ≤ 1, so it can only discount. And it is applied to
**positive points only**: you discount your own evidence, you never discount the
other side's. An adverse factor is carried at full weight on the assumption the
defence lands it.

On the seeded file that produces the single most useful number on the page:

> **Matrix position: 110 — Tier 2. Evidence-adjusted: 84.6 — Tier 3.**
> The 25-point gap is where the file is thin. Closing it is corroboration work,
> not collection work.

The diagnostic confirmation — the LP opening pressure of 32 cm H₂O, the fact the
entire injury claim rests on — scores 72%, because it appears on exactly one page
of one document.

### What breaks this case

Every scoring factor is struck from the file and the case **fully re-scored** —
not arithmetic, a complete re-evaluation, because losing a record cascades (the
LP note also carries the diagnosis date other factors anchor on).

The answer for Whitfield is uncomfortable and correct: the case sits at 110
points, and Tier 2 begins at 110. **Every scoring factor is load-bearing.** The
loss of any one of them drops a tier. That is the sentence a partner needs before
they take the case to a mediator, and no one has ever been able to produce it in
under three days.

### The record you request can hurt you

Requests are ranked by **expected** value, not best case:

```
expected = prior × best + (1 - prior) × worst
```

| Request | Best | Worst | Prior | **Expected** |
|---|---|---|---|---|
| Pre-exposure PCP records | +15 | **−10** | 70% | **+7.5** |
| 6-month neuro-ophth exam | +20 | 0 | 35% | **+7.0** |

The first request has a downside: go looking for pre-exposure records and you may
find the very headache history that sinks the case. Ranking by best case would
have told you to chase the twenty-pointer. Ranking by expected value tells you
the truth — they are worth almost the same, and only one of them can hurt you.

### The score history

Because the score is a pure function of the record set, it can be replayed over
the documents in the order the firm received them. Not a simulation — the same
evaluator, run against progressively larger subsets of the same records:

```
2023-02-03  Northgate Pharmacy         0 pts  (+0)   Below matrix
2023-02-06  Lakeview Women's Health    70 pts (+70)  Tier 4   ← 6 injections
2023-02-10  Meridian Primary Care      87 pts (+17)  Tier 3   ← causation statement
2023-02-12  Springfield Imaging       102 pts (+15)  Tier 3   ← secondary causes excluded
2023-02-12  Northgate Eye Specialists 110 pts  (+8)  Tier 2   ← second attributing clinician
2023-02-14  Riverbend Urgent Care     110 pts  (+0)  Tier 2
```

The pharmacy fax that arrived first was worth nothing. The clinic's injection log
was worth seventy points. A new document just extends this list — which is what
makes ingestion feel like the case revaluing itself, with every point traceable
to a quote on a page.

### Ingest closes the loop

A PDF dropped on **Upload & Process** is extracted, grounded, and then — with one
click — written into the same tables the seeded documents live in. Nothing
downstream is told an ingest happened. The grid simply sees another document and
recomputes, because the score is a pure function of the record set. The delta the
page shows you is not a simulation of a re-score; it **is** the re-score.

### The memo, and where the model is finally allowed to speak

`Draft assessment` sends the finished scorecard to Sonnet and asks for the memo a
senior associate would write from it. The model never sees the records — only the
result — so it cannot change a number. It can only describe one.

And it is verified the way everything else here is verified. The extraction stage
checks every quote against the page it cites; the memo checks **every figure
against the scorecard it was given**. A number the scorecard does not contain is a
fabricated number, and it is shown to the reader as one:

> ⚠ These figures appear in the memo but not in the scorecard, and should not be
> relied on: $450,000, 87%

That is the whole architecture in one line. The model reads and writes. The engine
decides. The grounding check is what makes it safe to let the model near either.

Exports a **Matrix Position Statement** (.docx) with every point cited, the
evidence-adjusted position, the fragility analysis, the score history, and the
engine version stamped on the front so the result is reproducible. Each export
pins an immutable snapshot to `case_scores`.

## Web app

```bash
npm install && npm run dev
```

- **Dashboard** — matter banner, KPIs, routing distribution, audit trail
- **Work List** — dense document grid with Salesforce IDs and routing counts
- **Workbench** — enriched-PDF viewer (highlights + outline render natively) with
  findings / bookmarks / extracted-fields panels, page-jump, validate/reject
- **Review Queue** — lowest-confidence-first exception handling
- **Case Profile** — cross-document Plaintiff Fact Sheet with per-field
  provenance, conflict surfacing, approve/reject, and `.docx` export
- **Settlement Grid** — deterministic matrix scoring with cited points, unresolved
  factors ranked by value of information, and a per-document score history
- **Upload & Process** — drop any PDF: OCR, term matching, and Sonnet record
  extraction run live, with ungrounded records visibly rejected
- **Litify Sync** — simulated connection health, SOQL pull log, and write-back
  staging (ContentVersion insert → ContentDocumentLink → field PATCH → Task),
  gated on explicit approval

## Admin application (Payload CMS)

The primary operator UI is now **Payload CMS** (Vercel's Next.js-native CMS),
mounted at `/admin` in this same app. It provides the professionally designed
interface for the whole review workflow: browse Case Documents, open Findings
(sorted lowest-confidence first, searchable by term/evidence), set a review
`decision` (which auto-writes an Audit Event via hook), and inspect the
append-only Audit Trail. Payload runs on the same Supabase Postgres in an
isolated `payload` schema; migrations run automatically on first boot
(`prodMigrations`).

Required environment variables (Vercel → Settings → Environment Variables):

- `DATABASE_URI` — Postgres session-pooler string for the `payload_admin` role
- `PAYLOAD_SECRET` — Payload auth/crypto secret

After the first deploy with env set: `POST /api/payload-seed` with header
`x-seed-token: $PAYLOAD_SECRET` loads the demo matter/documents/findings, then
visit `/admin` to create the first admin user.

## Persistence (Supabase)

Findings, extracted records, review decisions, and audit events live in a
Supabase Postgres (`matters`, `documents`, `findings`, `case_records`,
`audit_events`) with Row Level Security:
anonymous read everywhere; anonymous writes limited to review decisions on
`findings` and inserts on `audit_events`. Workbench validate/reject and the
review queue's approve/correct/escalate persist with an audit event and
survive reloads. The static JSON under `public/demo/` remains a read fallback
if the store is unreachable.

`case_records` and the append-only `case_scores` history are created by:

```bash
psql "$SUPABASE_DB_URL" -f supabase/0001_case_records.sql
psql "$SUPABASE_DB_URL" -f supabase/0002_seed_case_records.sql
psql "$SUPABASE_DB_URL" -f supabase/0003_case_scores.sql
```

The publishable key in `lib/supabase.ts` is intentionally client-safe (RLS is
the enforcement layer) and can be overridden with `NEXT_PUBLIC_SUPABASE_URL`
and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel.

## Roadmap (next slices)

1. Attach the draft fact sheet to the Litify write-back flow (today it is a
   download; it should stage like the enriched PDF does)
2. Version and persist each generated profile (`case_profile_versions`) so an
   export is a citable artifact rather than a client-side recomputation
3. Managed Agents escalation worker (agent second-opinion on escalated records)
4. Real Litify connector behind the same interface as the mock
   (`app/api/litify/*` defines the contract)
5. Adjustable-schema editor backed by a describe()-shaped definition file
6. Supabase Realtime for a live processing board

## Environment

`ANTHROPIC_API_KEY` — required by the extraction stage: by
`casepipe.extract_records` when run against the API (not needed for `--raw`
replay), and by `app/api/extract-records`, the live route behind Upload &
Process. Without it, the seeded Case Profile still renders in full from the
committed records; only live extraction of a newly dropped PDF is disabled, and
the page says so.

Optional: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`DATABASE_URI` and `PAYLOAD_SECRET` (admin), `SUPABASE_SERVICE_ROLE_KEY` (never
in the repo).
