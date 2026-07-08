"""Term matching over page word streams.

Whole-phrase matching (multi-word variants) with an OCR-tolerant fuzzy
fallback, negation detection in a preceding word window, and a compound
confidence score:

    confidence = match_quality * mean OCR confidence of matched words
                 * source factor (text layer > OCR)

Every match carries page number, verbatim evidence window, and the union
bounding boxes of the matched words so highlights can be placed exactly.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from importlib import resources

from rapidfuzz import fuzz

from .extract import PageText, Word

_PUNCT = re.compile(r"[^\w./-]+")


def _norm(token: str) -> str:
    return _PUNCT.sub("", token.lower())


def load_taxonomy(path: str | None = None) -> dict:
    if path:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    with resources.files("casepipe").joinpath("terms.json").open("r", encoding="utf-8") as f:
        return json.load(f)


@dataclass
class Match:
    category: str
    category_label: str
    term_key: str
    term_label: str
    variant: str
    page: int
    match_quality: float          # 1.0 exact, <1.0 fuzzy
    ocr_conf: float               # mean conf of matched words
    source: str                   # text_layer | ocr
    negated: bool
    evidence: str                 # verbatim context window
    rects: list[list[float]] = field(default_factory=list)  # word bboxes

    @property
    def confidence(self) -> float:
        src = 1.0 if self.source == "text_layer" else 0.94
        return round(self.match_quality * self.ocr_conf * src, 4)


def _window_text(words: list[Word], start: int, end: int, pad: int = 8) -> str:
    lo, hi = max(0, start - pad), min(len(words), end + pad)
    return " ".join(w.text for w in words[lo:hi])


def _is_negated(words: list[Word], start: int, cues: list[str], window: int) -> bool:
    lo = max(0, start - window)
    preceding = [_norm(w.text) for w in words[lo:start]]
    for cue in cues:
        cue_toks = cue.split()
        for i in range(len(preceding) - len(cue_toks) + 1):
            if preceding[i:i + len(cue_toks)] == cue_toks:
                return True
    return False


def _match_variant_at(norm_words: list[str], i: int, variant_toks: list[str],
                      fuzzy_min: int) -> float:
    """Return match quality (0 = no match) for variant starting at word i."""
    n = len(variant_toks)
    if i + n > len(norm_words):
        return 0.0
    window = norm_words[i:i + n]
    if window == variant_toks:
        return 1.0
    # fuzzy fallback: only for tokens of length >= 5 (OCR noise tolerance),
    # and require every token to clear the ratio bar.
    qualities = []
    for a, b in zip(window, variant_toks):
        if a == b:
            qualities.append(1.0)
            continue
        if len(b) < 5:
            return 0.0
        r = fuzz.ratio(a, b)
        if r < fuzzy_min:
            return 0.0
        qualities.append(r / 100.0)
    return round(sum(qualities) / len(qualities) * 0.97, 4)  # cap fuzzy below exact


def match_page(page: PageText, taxonomy: dict) -> list[Match]:
    words = page.words
    norm_words = [_norm(w.text) for w in words]
    cues = taxonomy["negation_cues"]
    neg_window = taxonomy["negation_window_words"]
    fuzzy_min = taxonomy["thresholds"]["fuzzy_min_ratio"]

    matches: list[Match] = []
    claimed: set[int] = set()  # word indices already consumed (longest-first wins)

    # Order variants longest-first so multi-word phrases beat substrings.
    flat: list[tuple[dict, dict, list[str], str]] = []
    for cat in taxonomy["categories"]:
        for term in cat["terms"]:
            for variant in term["variants"]:
                toks = [_norm(t) for t in variant.split()]
                flat.append((cat, term, toks, variant))
    flat.sort(key=lambda t: -len(t[2]))

    for cat, term, toks, variant in flat:
        i = 0
        while i < len(norm_words):
            if any((i + k) in claimed for k in range(len(toks))):
                i += 1
                continue
            q = _match_variant_at(norm_words, i, toks, fuzzy_min)
            if q > 0:
                span = range(i, i + len(toks))
                matched = [words[k] for k in span]
                matches.append(Match(
                    category=cat["key"], category_label=cat["label"],
                    term_key=term["key"], term_label=term["label"],
                    variant=variant, page=page.number,
                    match_quality=q,
                    ocr_conf=round(sum(w.conf for w in matched) / len(matched), 4),
                    source=page.source,
                    negated=_is_negated(words, i, cues, neg_window),
                    evidence=_window_text(words, i, i + len(toks)),
                    rects=[[w.x0, w.y0, w.x1, w.y1] for w in matched],
                ))
                claimed.update(span)
                i += len(toks)
            else:
                i += 1
    return matches
