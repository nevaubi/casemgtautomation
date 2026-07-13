-- Structured records from the Claude Sonnet 5 extraction stage.
--
-- Mirrors the `findings` table: one row per extracted item, carrying its own
-- confidence, routing and reviewer decision. The Case Profile page reads from
-- here first and falls back to the committed public/demo/*.records.json when
-- the database is unreachable, so the demo never goes blank.
--
-- Apply:  psql "$SUPABASE_DB_URL" -f supabase/0001_case_records.sql
--   then: psql "$SUPABASE_DB_URL" -f supabase/0002_seed_case_records.sql

create table if not exists public.case_records (
  id            text primary key,                 -- "<document_id>:<index>"
  document_id   text not null,
  type          text not null check (type in (
                  'demographic','exposure','administration','diagnosis',
                  'treatment','causation','provider','negated_finding')),
  page          integer not null,
  quote         text not null,                    -- verbatim, as the model returned it
  matched_text  text not null,                    -- what was actually found on the page
  certainty     text not null check (certainty in ('high','medium','low')),
  reported_by   text,                             -- null = first-hand documentation
  data          jsonb not null default '{}'::jsonb,
  grounding     numeric not null,                 -- 1.0 = exact token-span hit
  source        text not null check (source in ('text_layer','ocr')),
  page_conf     numeric not null,
  word_conf     numeric not null,
  confidence    numeric not null,
  routing       text not null check (routing in ('auto','review','escalated')),
  rects         jsonb not null default '[]'::jsonb,
  decision      text check (decision in ('approved','rejected','corrected','escalated')),
  decided_by    text,
  decided_at    timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists case_records_document_id_idx on public.case_records (document_id);
create index if not exists case_records_routing_idx     on public.case_records (routing);
create index if not exists case_records_type_idx        on public.case_records (type);

alter table public.case_records enable row level security;

-- Demo posture, identical to `findings`: anonymous read, and anonymous update
-- limited to the reviewer-decision columns. Tighten before this holds real PHI.
drop policy if exists case_records_read on public.case_records;
create policy case_records_read
  on public.case_records for select
  to anon, authenticated
  using (true);

drop policy if exists case_records_decide on public.case_records;
create policy case_records_decide
  on public.case_records for update
  to anon, authenticated
  using (true)
  with check (
    decision is null
    or decision = any (array['approved','rejected','corrected','escalated'])
  );
