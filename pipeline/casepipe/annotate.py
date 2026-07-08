"""Enriched-PDF generation.

Takes the original PDF plus scored matches and produces a new
"AI Reviewed - <name>.pdf" with:
  - highlight annotations on the exact matched word rects
  - popup notes carrying term, category, confidence, routing
  - a PDF outline (bookmark tree) grouped Category -> Term -> page hits

The original file is never modified.
"""

from __future__ import annotations

import os

import fitz

from .match import Match

# Highlight colors by routing (stroke RGB 0..1)
COLORS = {
    "auto": (0.55, 0.83, 0.45),      # green  — auto-accepted
    "review": (0.99, 0.85, 0.35),    # amber  — needs review
    "escalated": (0.95, 0.55, 0.35), # orange — agent-escalated / low conf
    "negated": (0.65, 0.75, 0.9),    # blue   — negation context (info only)
}


def route(match: Match, thresholds: dict) -> str:
    if match.negated:
        return "negated"
    c = match.confidence
    if c >= thresholds["auto_accept"]:
        return "auto"
    if c >= thresholds["review"]:
        return "review"
    return "escalated"


def annotate(pdf_path: str, matches: list[Match], thresholds: dict,
             out_dir: str) -> str:
    doc = fitz.open(pdf_path)

    for m in matches:
        page = doc[m.page - 1]
        r = route(m, thresholds)
        quads = [fitz.Rect(*rect) for rect in m.rects]
        annot = page.add_highlight_annot(quads)
        annot.set_colors(stroke=COLORS[r])
        annot.set_info(
            title="Case Automation AI",
            subject=f"{m.category_label} / {m.term_label}",
            content=(
                f"{'NEGATED - context only. ' if m.negated else ''}"
                f"Finding: {m.term_label}\n"
                f"Matched: \"{m.variant}\"\n"
                f"Evidence: ...{m.evidence}...\n"
                f"Confidence: {m.confidence:.2f}  Source: {m.source}\n"
                f"Routing: {r}"
            ),
        )
        annot.update()

    # Bookmark tree: Category -> Term -> individual hits
    toc: list[list] = [[1, "AI Findings", matches[0].page if matches else 1]]
    by_cat: dict[str, dict[str, list[Match]]] = {}
    for m in matches:
        if m.negated:
            continue
        by_cat.setdefault(m.category_label, {}).setdefault(m.term_label, []).append(m)
    for cat_label in sorted(by_cat):
        terms = by_cat[cat_label]
        first_page = min(m.page for hits in terms.values() for m in hits)
        toc.append([2, cat_label, first_page])
        for term_label in sorted(terms):
            hits = sorted(terms[term_label], key=lambda m: (m.page, -m.confidence))
            toc.append([3, f"{term_label} ({len(hits)})", hits[0].page])
            seen_pages: set[int] = set()
            for m in hits:
                if m.page in seen_pages:
                    continue
                seen_pages.add(m.page)
                toc.append([4, f"p.{m.page} - {m.confidence:.2f} - \"{m.evidence[:48]}...\"",
                            m.page])
    if len(toc) > 1:
        doc.set_toc(toc)

    os.makedirs(out_dir, exist_ok=True)
    base = os.path.basename(pdf_path)
    out_path = os.path.join(out_dir, f"AI Reviewed - {base}")
    doc.save(out_path, garbage=3, deflate=True)
    doc.close()
    return out_path
