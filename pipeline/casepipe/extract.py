"""Page text acquisition.

For each page: use the native text layer when present; otherwise rasterize
and OCR with tesseract, keeping word-level bounding boxes and confidences.
All coordinates are normalized to PDF points (72 dpi space) so downstream
highlight annotation lands correctly regardless of source.
"""

from __future__ import annotations

import io
from dataclasses import dataclass, field

import fitz  # PyMuPDF
import pytesseract
from PIL import Image

OCR_DPI = 300
_SCALE = 72.0 / OCR_DPI  # tesseract pixel space -> PDF point space


@dataclass
class Word:
    text: str
    x0: float
    y0: float
    x1: float
    y1: float
    conf: float  # 0..1 (native text layer = 0.99)


@dataclass
class PageText:
    number: int              # 1-based
    source: str              # "text_layer" | "ocr"
    words: list[Word] = field(default_factory=list)
    mean_conf: float = 0.0

    @property
    def text(self) -> str:
        return " ".join(w.text for w in self.words)


def _native_words(page: fitz.Page) -> list[Word]:
    words = []
    for x0, y0, x1, y1, token, *_ in page.get_text("words"):
        token = token.strip()
        if token:
            words.append(Word(token, x0, y0, x1, y1, 0.99))
    return words


def _ocr_words(page: fitz.Page) -> list[Word]:
    pix = page.get_pixmap(dpi=OCR_DPI, colorspace=fitz.csGRAY)
    img = Image.open(io.BytesIO(pix.tobytes("png")))
    data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
    words = []
    for i in range(len(data["text"])):
        token = data["text"][i].strip()
        conf = float(data["conf"][i])
        if not token or conf < 0:
            continue
        x, y = data["left"][i], data["top"][i]
        w, h = data["width"][i], data["height"][i]
        words.append(Word(token, x * _SCALE, y * _SCALE,
                          (x + w) * _SCALE, (y + h) * _SCALE,
                          max(conf, 0.0) / 100.0))
    return words


def extract_pages(pdf_path: str) -> list[PageText]:
    """Extract a word stream per page, choosing text layer vs OCR per page."""
    doc = fitz.open(pdf_path)
    pages: list[PageText] = []
    for i, page in enumerate(doc):
        native = _native_words(page)
        if len(native) >= 5:
            pt = PageText(number=i + 1, source="text_layer", words=native)
        else:
            pt = PageText(number=i + 1, source="ocr", words=_ocr_words(page))
        pt.mean_conf = (sum(w.conf for w in pt.words) / len(pt.words)) if pt.words else 0.0
        pages.append(pt)
    doc.close()
    return pages
