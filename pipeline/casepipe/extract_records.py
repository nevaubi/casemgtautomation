"""LLM record-extraction stage (Claude Sonnet 5).

One call per document. The model sees page-tagged text — the same text the
deterministic matcher sees, text layer or OCR — and returns structured records
through a tool schema. Everything it returns is then grounded against the page
word stream (see records.py) before it is allowed into the case profile.

Usage
-----
  # extract with the API (requires ANTHROPIC_API_KEY)
  python -m casepipe.extract_records --input ../fixtures/records --out ../public/demo

  # replay a previously captured model response, no API call, no cost.
  # This is what CI and the eval gate use: the raw model output is committed,
  # so grounding/scoring/routing changes are reviewable without re-billing.
  python -m casepipe.extract_records --input ../fixtures/records \
      --out ../public/demo --raw ../fixtures/extractions

  # capture raw model output while extracting, for future replay
  python -m casepipe.extract_records --input ../fixtures/records \
      --out ../public/demo --save-raw ../fixtures/extractions
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import time
from dataclasses import asdict

from .extract import extract_pages
from .records import GroundedRecord, ground_records, load_spec


def build_document_text(pages) -> str:
    """Page-tagged plain text. The model only ever sees this — it never sees
    the PDF, so it cannot 'read' anything the OCR did not produce."""
    blocks = []
    for p in pages:
        header = (
            f"<page number=\"{p.number}\" source=\"{p.source}\" "
            f"ocr_confidence=\"{p.mean_conf:.2f}\">"
        )
        blocks.append(f"{header}\n{p.text}\n</page>")
    return "\n\n".join(blocks)


def call_model(spec: dict, doc_text: str, filename: str) -> list[dict]:
    from anthropic import Anthropic  # imported lazily so --raw needs no SDK

    client = Anthropic()
    tool = spec["tool"]
    # Sonnet 5 rejects sampling parameters (temperature/top_p/top_k) with a 400.
    # Reproducibility here does not come from temperature anyway — it comes from
    # grounding: whatever the model samples, a record the page cannot support is
    # dropped. Adaptive thinking is on by default and counts against max_tokens,
    # so the budget covers thinking plus the tool call; effort is set explicitly
    # rather than left at the "high" default.
    msg = client.messages.create(
        model=spec["model"],
        max_tokens=spec["max_tokens"],
        output_config={"effort": spec["effort"]},
        system=spec["system_prompt"],
        tools=[tool],
        tool_choice={"type": "tool", "name": tool["name"]},
        messages=[{
            "role": "user",
            "content": (
                f"Document: {filename}\n"
                "Pages with source=\"ocr\" were scanned; their text is degraded and you must "
                "quote it exactly as garbled. Extract every structured record.\n\n"
                f"{doc_text}"
            ),
        }],
    )
    for block in msg.content:
        if block.type == "tool_use" and block.name == tool["name"]:
            return block.input.get("records", [])
    return []


def process_pdf(pdf_path: str, out_dir: str, spec: dict,
                raw_dir: str | None, save_raw_dir: str | None) -> dict:
    t0 = time.time()
    base = os.path.splitext(os.path.basename(pdf_path))[0]
    pages = extract_pages(pdf_path)

    raw_path = os.path.join(raw_dir, f"{base}.raw.json") if raw_dir else None
    if raw_path and os.path.exists(raw_path):
        with open(raw_path, encoding="utf-8") as f:
            raw_records = json.load(f)["records"]
        mode = "replay"
    else:
        raw_records = call_model(spec, build_document_text(pages), os.path.basename(pdf_path))
        mode = "api"
        if save_raw_dir:
            os.makedirs(save_raw_dir, exist_ok=True)
            with open(os.path.join(save_raw_dir, f"{base}.raw.json"), "w", encoding="utf-8") as f:
                json.dump({"document_id": base, "model": spec["model"],
                           "records": raw_records}, f, indent=2)

    kept, rejected = ground_records(base, pages, raw_records, spec)

    result = {
        "document_id": base,
        "source_pdf": os.path.basename(pdf_path),
        "model": spec["model"],
        "spec_version": spec["meta"]["version"],
        "extraction_mode": mode,
        "pages": [{"number": p.number, "source": p.source,
                   "mean_conf": round(p.mean_conf, 4)} for p in pages],
        "counts": {
            "proposed": len(raw_records),
            "grounded": len(kept),
            "rejected": len(rejected),
            "auto": sum(1 for r in kept if r.routing == "auto"),
            "review": sum(1 for r in kept if r.routing == "review"),
            "escalated": sum(1 for r in kept if r.routing == "escalated"),
        },
        "by_type": {
            t: sum(1 for r in kept if r.type == t)
            for t in sorted({r.type for r in kept})
        },
        "processing_seconds": round(time.time() - t0, 2),
        "records": [asdict(r) for r in kept],
        "rejected": rejected,
    }
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, f"{base}.records.json"), "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)
    return result


def main() -> None:
    ap = argparse.ArgumentParser(description="Claude Sonnet record extraction")
    ap.add_argument("--input", required=True, help="directory of PDFs")
    ap.add_argument("--out", required=True, help="output directory for *.records.json")
    ap.add_argument("--raw", default=None, help="replay directory of *.raw.json (no API call)")
    ap.add_argument("--save-raw", default=None, help="write raw model output here")
    args = ap.parse_args()

    spec = load_spec()
    total_kept = total_rejected = 0
    for pdf in sorted(glob.glob(os.path.join(args.input, "*.pdf"))):
        r = process_pdf(pdf, args.out, spec, args.raw, args.save_raw)
        total_kept += r["counts"]["grounded"]
        total_rejected += r["counts"]["rejected"]
        print(
            f"{r['document_id']:<42} [{r['extraction_mode']:>6}] "
            f"{r['counts']['proposed']:>3} proposed  "
            f"{r['counts']['grounded']:>3} grounded  "
            f"{r['counts']['rejected']:>2} rejected  "
            f"({r['counts']['auto']} auto / {r['counts']['review']} review / "
            f"{r['counts']['escalated']} escalated)"
        )
    denom = total_kept + total_rejected
    rate = (total_rejected / denom * 100) if denom else 0.0
    print(f"\n{total_kept} records grounded, {total_rejected} rejected "
          f"(ungrounded rate {rate:.1f}%)")


if __name__ == "__main__":
    main()
