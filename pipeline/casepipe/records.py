"""Grounding and scoring for the LLM record-extraction stage.

The model proposes records; this module decides whether to believe them.

Every record the model emits must carry a verbatim `quote` and the page it
came from. Here we try to locate that quote in the actual word stream of that
page (the same word stream the deterministic matcher runs on). A record whose
quote cannot be located is a hallucination and is dropped — the model does not
get to assert anything the document does not say.

A located quote also gives us, for free, the two things the demo needs:
  * rects  — the union of the word boxes, so the record highlights on the page
  * conf   — the OCR confidence of the words actually quoted

Confidence mirrors the term-matcher's formula so the two stages route on the
same scale:

    confidence = certainty x grounding x page_mean_conf x source_factor

where certainty is the model's own stated confidence, grounding is 1.0 for an
exact token-span hit and a fuzzy ratio below that, page_mean_conf is the OCR
confidence of the page, and source_factor penalises OCR pages. A clean
text-layer page yields ~0.96 (auto); a 0.47-confidence fax yields ~0.43
(escalated). That is the intended behaviour: we do not let the model be
confident about text the OCR could not read.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from typing import Any

from rapidfuzz import fuzz

from .extract import PageText, Word

SPEC_PATH = os.path.join(os.path.dirname(__file__), "record_spec.json")

_KEEP = re.compile(r"[^\w./-]")


def load_spec(path: str = SPEC_PATH) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _norm(token: str) -> str:
    """Same normalisation the term matcher uses, so grounding is measured on
    the same footing as matching."""
    return _KEEP.sub("", token.lower())


def _tokens(text: str) -> list[str]:
    return [t for t in (_norm(t) for t in text.split()) if t]


@dataclass
class GroundedRecord:
    id: str
    type: str
    page: int
    quote: str                      # verbatim, as the model returned it
    matched_text: str               # what we actually found on the page
    certainty: str
    reported_by: str | None
    data: dict[str, Any]
    grounding: float                # 1.0 exact span, <1.0 fuzzy, dropped below min
    source: str                     # text_layer | ocr
    page_conf: float
    word_conf: float                # mean conf of the quoted words themselves
    confidence: float
    routing: str                    # auto | review | escalated
    rects: list[list[float]] = field(default_factory=list)


def _span_quality(page_toks: list[str], start: int, quote_toks: list[str], fuzzy_min: int) -> float:
    """Score the alignment of quote_toks against page_toks[start:start+n]."""
    n = len(quote_toks)
    if start + n > len(page_toks):
        return 0.0
    window = page_toks[start : start + n]
    if window == quote_toks:
        return 1.0
    qualities = []
    for a, b in zip(window, quote_toks):
        if a == b:
            qualities.append(1.0)
            continue
        # Short tokens are too easy to match by accident; require them exact.
        if len(b) < 4:
            return 0.0
        r = fuzz.ratio(a, b)
        if r < fuzzy_min:
            return 0.0
        qualities.append(r / 100.0)
    return round(sum(qualities) / len(qualities) * 0.97, 4)


def locate_quote(page: PageText, quote: str, fuzzy_min: int) -> tuple[float, int, int]:
    """Find `quote` in the page word stream.

    Returns (grounding, word_start, word_end) as indices into page.words.
    grounding is 0.0 when the quote is not present, which means the record is
    discarded. Words that normalise to nothing (bullets, rules, stray marks)
    are skipped on both sides so punctuation noise cannot break an alignment.
    """
    quote_toks = _tokens(quote)
    if not quote_toks:
        return 0.0, -1, -1

    page_toks: list[str] = []
    word_index: list[int] = []
    for i, w in enumerate(page.words):
        t = _norm(w.text)
        if t:
            page_toks.append(t)
            word_index.append(i)
    if len(page_toks) < len(quote_toks):
        return 0.0, -1, -1

    best = (0.0, -1, -1)
    for i in range(len(page_toks) - len(quote_toks) + 1):
        # cheap gate: first token must be plausible before we score the window
        if page_toks[i] != quote_toks[0] and fuzz.ratio(page_toks[i], quote_toks[0]) < fuzzy_min:
            continue
        q = _span_quality(page_toks, i, quote_toks, fuzzy_min)
        if q > best[0]:
            start = word_index[i]
            end = word_index[i + len(quote_toks) - 1] + 1
            best = (q, start, end)
            if q == 1.0:
                break
    return best


def _rects(words: list[Word], start: int, end: int) -> list[list[float]]:
    """One rect per visual line of the quoted span, so highlights don't smear
    across the whole page."""
    if start < 0:
        return []
    lines: list[list[Word]] = []
    for w in words[start:end]:
        if lines and abs(lines[-1][-1].y0 - w.y0) < 3.0:
            lines[-1].append(w)
        else:
            lines.append([w])
    out = []
    for line in lines:
        out.append([
            round(min(w.x0 for w in line), 2), round(min(w.y0 for w in line), 2),
            round(max(w.x1 for w in line), 2), round(max(w.y1 for w in line), 2),
        ])
    return out


def route(confidence: float, thresholds: dict) -> str:
    if confidence >= thresholds["auto_accept"]:
        return "auto"
    if confidence >= thresholds["review"]:
        return "review"
    return "escalated"


def ground_records(
    doc_id: str,
    pages: list[PageText],
    raw_records: list[dict],
    spec: dict,
) -> tuple[list[GroundedRecord], list[dict]]:
    """Verify, score, and route every record the model proposed.

    Returns (kept, rejected). `rejected` carries the reason, so the extraction
    run can be audited and the hallucination rate tracked over time.
    """
    cfg = spec["confidence"]
    by_number = {p.number: p for p in pages}
    kept: list[GroundedRecord] = []
    rejected: list[dict] = []

    for i, r in enumerate(raw_records):
        page = by_number.get(int(r.get("page", 0)))
        if page is None:
            rejected.append({"index": i, "reason": "page_out_of_range", "record": r})
            continue

        grounding, start, end = locate_quote(page, r.get("quote", ""), cfg["fuzzy_min_ratio"])
        if grounding < cfg["min_grounding"]:
            rejected.append({
                "index": i,
                "reason": "quote_not_grounded",
                "grounding": grounding,
                "page": page.number,
                "record": r,
            })
            continue

        quoted = page.words[start:end]
        word_conf = round(sum(w.conf for w in quoted) / len(quoted), 4) if quoted else 0.0
        certainty = cfg["certainty_weight"].get(r.get("certainty", "medium"), 0.8)
        source_factor = cfg["source_factor"][page.source]
        confidence = round(certainty * grounding * page.mean_conf * source_factor, 4)

        kept.append(GroundedRecord(
            id=f"{doc_id}:{i}",
            type=r["type"],
            page=page.number,
            quote=r.get("quote", ""),
            matched_text=" ".join(w.text for w in quoted),
            certainty=r.get("certainty", "medium"),
            reported_by=(r.get("reported_by") or None),
            data={k: v for k, v in (r.get("data") or {}).items() if v not in (None, "")},
            grounding=grounding,
            source=page.source,
            page_conf=round(page.mean_conf, 4),
            word_conf=word_conf,
            confidence=confidence,
            routing=route(confidence, cfg["thresholds"]),
            rects=_rects(page.words, start, end),
        ))

    return kept, rejected
