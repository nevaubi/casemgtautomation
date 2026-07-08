"""CLI runner and accuracy scorer.

Usage:
  python -m casepipe.run --input fixtures/records --out out/               # process all PDFs
  python -m casepipe.score --findings out/ --truth fixtures/records/ground_truth.json
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import time
from dataclasses import asdict

from .annotate import annotate, route
from .extract import extract_pages
from .match import load_taxonomy, match_page


def process_pdf(pdf_path: str, out_dir: str, taxonomy: dict) -> dict:
    t0 = time.time()
    pages = extract_pages(pdf_path)
    matches = []
    for page in pages:
        matches.extend(match_page(page, taxonomy))
    thresholds = taxonomy["thresholds"]
    enriched = annotate(pdf_path, matches, thresholds, out_dir)

    findings = []
    for m in matches:
        d = asdict(m)
        d["confidence"] = m.confidence
        d["routing"] = route(m, thresholds)
        findings.append(d)

    result = {
        "source_pdf": os.path.basename(pdf_path),
        "enriched_pdf": os.path.basename(enriched),
        "pages": [
            {"number": p.number, "source": p.source,
             "mean_conf": round(p.mean_conf, 4), "words": len(p.words)}
            for p in pages
        ],
        "counts": {
            "total": len(findings),
            "auto": sum(1 for f in findings if f["routing"] == "auto"),
            "review": sum(1 for f in findings if f["routing"] == "review"),
            "escalated": sum(1 for f in findings if f["routing"] == "escalated"),
            "negated": sum(1 for f in findings if f["routing"] == "negated"),
        },
        "processing_seconds": round(time.time() - t0, 2),
        "findings": findings,
    }
    base = os.path.splitext(os.path.basename(pdf_path))[0]
    with open(os.path.join(out_dir, f"{base}.findings.json"), "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)
    return result


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="PDF file or directory")
    ap.add_argument("--out", required=True)
    ap.add_argument("--terms", default=None, help="optional taxonomy JSON path")
    args = ap.parse_args()

    taxonomy = load_taxonomy(args.terms)
    paths = ([args.input] if args.input.lower().endswith(".pdf")
             else sorted(glob.glob(os.path.join(args.input, "*.pdf"))))
    os.makedirs(args.out, exist_ok=True)
    for p in paths:
        r = process_pdf(p, args.out, taxonomy)
        c = r["counts"]
        print(f"{r['source_pdf']}: {c['total']} findings "
              f"(auto {c['auto']} / review {c['review']} / escalated {c['escalated']} "
              f"/ negated {c['negated']}) in {r['processing_seconds']}s")


if __name__ == "__main__":
    main()
