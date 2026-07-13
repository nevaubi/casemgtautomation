"""Regenerate supabase/0002_seed_case_records.sql from the committed records.

    python pipeline/emit_records_sql.py

Run this after any extraction run so the database and the static fallback
artifacts never drift apart.
"""

from __future__ import annotations

import glob
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEMO = os.path.join(ROOT, "public", "demo")
OUT = os.path.join(ROOT, "supabase", "0002_seed_case_records.sql")


def q(v: object) -> str:
    if v is None:
        return "null"
    return "'" + str(v).replace("'", "''") + "'"


def main() -> None:
    lines = [
        "-- Seed public.case_records from the committed pipeline artifacts.",
        "-- Regenerate:  python pipeline/emit_records_sql.py",
        "begin;",
        "truncate table public.case_records;",
    ]
    n = 0
    for path in sorted(glob.glob(os.path.join(DEMO, "*.records.json"))):
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        doc = d["document_id"]
        lines.append(f"\n-- {doc}: {d['counts']['grounded']} records")
        for r in d["records"]:
            lines.append(
                "insert into public.case_records (id,document_id,type,page,quote,matched_text,"
                "certainty,reported_by,data,grounding,source,page_conf,word_conf,confidence,"
                "routing,rects) values ("
                f"{q(r['id'])},{q(doc)},{q(r['type'])},{r['page']},{q(r['quote'])},"
                f"{q(r['matched_text'])},{q(r['certainty'])},{q(r['reported_by'])},"
                f"{q(json.dumps(r['data']))}::jsonb,{r['grounding']},{q(r['source'])},"
                f"{r['page_conf']},{r['word_conf']},{r['confidence']},{q(r['routing'])},"
                f"{q(json.dumps(r['rects']))}::jsonb);"
            )
            n += 1
    lines.append(
        "\ninsert into public.audit_events (event, document_id, detail, actor) values "
        f"('extraction.records_seeded', null, 'Seeded {n} grounded records from "
        f"claude-sonnet-5 extraction (spec v1)', 'pipeline');"
    )
    lines.append("commit;")
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print(f"{n} records -> {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()
