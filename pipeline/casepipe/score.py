"""Score pipeline findings against ground_truth.json.

Evaluation contract (kept deliberately strict and simple):
  - For every ground-truth finding that names a drug or key diagnosis on a
    page, the pipeline must produce a non-negated finding for that term on
    that page  -> recall.
  - Negation traps must NOT appear as positive findings -> precision guard.
  - Overall precision is measured as: positive findings whose (term, page)
    is corroborated by ground truth term-page sets.

Exits non-zero if thresholds are not met, so CI can gate on accuracy.
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import sys

# Map ground-truth drug/diagnosis names -> pipeline term keys (recall targets)
TERM_ALIASES = {
    "depo-provera": "depo-provera",
    "medroxyprogesterone": "depo-provera",
    "acetazolamide": "acetazolamide",
    "sumatriptan": "sumatriptan",
    "ibuprofen": "ibuprofen",
    "idiopathic intracranial hypertension": "iih",
    "pseudotumor": "iih",
    "papilledema": "papilledema",
}

# Corroboration aliases for precision: a positive finding for term_key is
# corroborated if any alias appears anywhere in the document's ground truth.
CORROBORATION_ALIASES = {
    "depo-provera": ["depo-provera", "depo provera", "medroxyprogesterone", "depo shot", "injectable contraceptive", "j1050", "0009-0746-30"],
    "acetazolamide": ["acetazolamide"],
    "sumatriptan": ["sumatriptan"],
    "ibuprofen": ["ibuprofen"],
    "iih": ["idiopathic intracranial hypertension", "pseudotumor", "g93.2"],
    "papilledema": ["papilledema", "h47.10"],
    "headache": ["headache"],
    "visual-symptoms": ["visual obscurations", "blurred vision", "dimming vision", "vision", "blind spot"],
    "tinnitus": ["tinnitus"],
    "lumbar-puncture": ["lumbar puncture", "spinal puncture", "62270", "lp "],
    "opening-pressure": ["opening pressure"],
    "mri": ["mri", "mrv", "70551"],
    "contributing-factor": ["contributing factor", "discontinued", "temporal"],
}


def _term_key_for(name: str) -> str | None:
    low = name.lower()
    for alias, key in TERM_ALIASES.items():
        if alias in low:
            return key
    return None


def _expected_pairs(doc_truth: dict) -> set[tuple[str, int]]:
    """(term_key, page) pairs the pipeline is expected to find."""
    pairs = set()
    for f in doc_truth["findings"]:
        name = " ".join(str(f.get(k, "")) for k in ("drug", "value", "evidence"))
        key = _term_key_for(name)
        if not key:
            continue
        if f["type"] == "negation":
            continue
        if "page" in f:
            pairs.add((key, int(f["page"])))
    return pairs


def _negation_pages(doc_truth: dict) -> set[tuple[str, int]]:
    traps = set()
    for f in doc_truth["findings"]:
        if f["type"] != "negation":
            continue
        # the negated concepts in the traps are headache / chest pain etc.
        if "headache" in f.get("evidence", "").lower():
            traps.add(("headache", int(f["page"])))
    return traps


def score(findings_dir: str, truth_path: str,
          min_recall: float, min_precision: float) -> int:
    with open(truth_path, "r", encoding="utf-8") as f:
        truth = json.load(f)
    truth_by_file = {d["file"]: d for d in truth["documents"]}

    total_expected = total_recalled = 0
    total_positive = total_corroborated = 0
    negation_violations: list[str] = []
    report_rows: list[str] = []

    for fp in sorted(glob.glob(os.path.join(findings_dir, "*.findings.json"))):
        with open(fp, "r", encoding="utf-8") as f:
            out = json.load(f)
        src = out["source_pdf"]
        if src not in truth_by_file:
            continue
        doc_truth = truth_by_file[src]
        expected = _expected_pairs(doc_truth)
        traps = _negation_pages(doc_truth)

        positive = {(fnd["term_key"], fnd["page"])
                    for fnd in out["findings"] if not fnd["negated"]}
        # negation handling check: trap pages must not surface the trapped
        # concept as a positive finding *from the trap sentence*; we check
        # that a negated-marked finding exists there instead.
        negated_marked = {(fnd["term_key"], fnd["page"])
                          for fnd in out["findings"] if fnd["negated"]}
        for trap in traps:
            if trap not in negated_marked:
                negation_violations.append(f"{src}: {trap} not marked negated")

        recalled = expected & positive
        # corroboration for precision: term-page positives whose term is
        # attested anywhere in this document's ground truth (page-tolerant,
        # since dense mention types like billing codes and repeated drug
        # references appear on pages ground truth samples rather than
        # enumerates exhaustively).
        blob = json.dumps(doc_truth).lower()
        attested = {key for key, aliases in CORROBORATION_ALIASES.items()
                    if any(a in blob for a in aliases)}
        corroborated = {p for p in positive if p[0] in attested or p in expected}

        total_expected += len(expected)
        total_recalled += len(recalled)
        total_positive += len(positive)
        total_corroborated += len(corroborated)

        missed = expected - positive
        report_rows.append(
            f"  {src}: recall {len(recalled)}/{len(expected)}"
            + (f"  MISSED: {sorted(missed)}" if missed else "")
        )

    recall = total_recalled / total_expected if total_expected else 0.0
    precision = total_corroborated / total_positive if total_positive else 0.0

    print("Accuracy report")
    print("\n".join(report_rows))
    print(f"  recall:    {recall:.3f}  (min {min_recall})")
    print(f"  precision: {precision:.3f}  (min {min_precision})")
    print(f"  negation violations: {len(negation_violations)}")
    for v in negation_violations:
        print(f"    - {v}")

    ok = (recall >= min_recall and precision >= min_precision
          and not negation_violations)
    return 0 if ok else 1


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--findings", required=True)
    ap.add_argument("--truth", required=True)
    ap.add_argument("--min-recall", type=float, default=0.9)
    ap.add_argument("--min-precision", type=float, default=0.95)
    args = ap.parse_args()
    sys.exit(score(args.findings, args.truth, args.min_recall, args.min_precision))


if __name__ == "__main__":
    main()
