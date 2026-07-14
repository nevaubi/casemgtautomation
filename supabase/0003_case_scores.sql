-- Immutable score snapshots. The grid is a pure function of (records, matrix
-- version), so a snapshot is reproducible evidence of what the file supported at
-- a point in time — which is what you need if a settlement allocation is ever
-- questioned.
--
-- Apply:  psql "$SUPABASE_DB_URL" -f supabase/0003_case_scores.sql

create table if not exists public.case_scores (
  id             bigserial primary key,
  matter_id      text not null,
  matrix_name    text not null,
  matrix_version integer not null,
  documents      integer not null,
  records        integer not null,
  points         integer not null,
  floor_points   integer not null,
  ceiling_points integer not null,
  tier           text not null,
  ceiling_tier   text not null,
  gates_passed   boolean not null,
  open_factors   integer not null,
  scorecard      jsonb not null,
  trigger_doc    text,
  actor          text,
  created_at     timestamptz not null default now()
);

create index if not exists case_scores_matter_idx on public.case_scores (matter_id, created_at desc);

alter table public.case_scores enable row level security;

drop policy if exists case_scores_read on public.case_scores;
create policy case_scores_read
  on public.case_scores for select
  to anon, authenticated
  using (true);

-- Snapshots are append-only by design: a score history you can edit is not a
-- score history. No update or delete policy is granted.
drop policy if exists case_scores_insert on public.case_scores;
create policy case_scores_insert
  on public.case_scores for insert
  to anon, authenticated
  with check (true);
