"""
SecureContent AI — Optional Docling ingestion worker

Run locally for higher-quality PDF/DOCX/PPTX/image parsing:

  pip install -r requirements.txt
  uvicorn app:app --host 127.0.0.1 --port 8001

Set DOCLING_WORKER_URL=http://localhost:8001/parse in your .env
and the Next.js upload route will proxy binary files here first.

If Docling itself is installed, it is used; otherwise the worker falls back
to pdfminer / python-docx / python-pptx / Pillow+pytesseract so the service stays useful
without heavy model downloads.

Quality gate: every extraction is scored — garbled binary (PJYI~, hex, CID junk) is
never returned as text. Instead a 422 with warnings is sent and the Node side
shows a helpful placeholder rather than obscure characters.
"""

from __future__ import annotations

import io
import os
import re
import traceback
from pathlib import Path

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse

app = FastAPI(title="SecureContent AI — Docling Worker", version="0.2.0")

try:
    from docling.document_converter import DocumentConverter  # type: ignore

    _HAS_DOCLING = True
    _converter = DocumentConverter()
except Exception:
    _HAS_DOCLING = False
    _converter = None

try:
    import fitz  # PyMuPDF optional
    _HAS_PYMUPDF = True
except Exception:
    _HAS_PYMUPDF = False

try:
    from PIL import Image  # Pillow

    _HAS_PIL = True
except Exception:
    _HAS_PIL = False

try:
    import pytesseract  # OCR

    _HAS_TESSERACT = True
except Exception:
    _HAS_TESSERACT = False

# ---------------------------------------------------------------------------
# Quality scoring — mirror of Node's scoreTextQuality to avoid garbage
# ---------------------------------------------------------------------------

_COMMON_RE = re.compile(
    r"\b(the|and|or|is|to|of|in|for|with|on|as|by|at|from|this|that|was|are|has|have|will|document|report|incident|security|management|policy|data|information|system|user|content|page|section|paragraph)\b",
    re.I,
)
_SECRET_RE = re.compile(r"AKIA[0-9A-Z]{12,}|ghp_[A-Za-z0-9]{10,}|BEGIN.*PRIVATE KEY|eyJ[A-Za-z0-9_-]{8,}\.eyJ")
_CONTROL_RE = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]")
_ZERO_WIDTH_RE = re.compile(r"[\u200B-\u200D\uFEFF\u00AD]")


def normalize_text(s: str) -> str:
    if not s:
        return ""
    try:
        s = s.encode("utf-8", errors="ignore").decode("utf-8")
    except Exception:
        pass
    s = _CONTROL_RE.sub("", s)
    s = _ZERO_WIDTH_RE.sub("", s)
    s = s.replace("\uFFFD", "")
    s = re.sub(r"\n{3,}", "\n\n", s)
    # strip lone surrogates
    s = "".join(c for c in s if not (0xD800 <= ord(c) <= 0xDFFF))
    return s.strip()


def score_quality(text: str) -> dict:
    if not text or not text.strip():
        return {"score": 0, "is_garbage": True, "printable": 0, "space": 0}
    if _SECRET_RE.search(text[:4000]):
        return {"score": 0.85, "is_garbage": False, "printable": 1, "space": 0.15}
    sample = text[:8000]
    printable = len(re.sub(r"[^\x20-\x7E\x0A\x0D\x09\xA0-\u024F\u0400-\u04FF\u0900-\u097F\u0600-\u06FF\u4E00-\u9FFF]", "", sample))
    printable_ratio = printable / max(1, len(sample))
    spaces = sample.count(" ")
    space_ratio = spaces / max(1, len(sample))
    words = [w for w in sample.split() if w]
    avg_len = len(sample) / max(1, len(words))
    dict_matches = len(_COMMON_RE.findall(sample))
    dict_ratio = dict_matches / max(1, len(words))
    garbled = 0
    alpha = 0
    for w in words[:200]:
        cw = re.sub(r"^[^\w]+|[^\w]+$", "", w)
        if not cw:
            continue
        if re.match(r"^[a-zA-Z]{2,20}$", cw):
            alpha += 1
        if re.search(r"[^a-zA-Z]", cw) and not re.search(r"[aeiouAEIOU]", cw) and len(cw) > 5:
            garbled += 1
        if len(cw) > 25:
            garbled += 1
    alpha_ratio = alpha / max(1, min(len(words), 200))
    garbled_ratio = garbled / max(1, min(len(words), 200))
    is_garbage = False
    if printable_ratio < 0.72:
        is_garbage = True
    elif space_ratio < 0.04 and len(words) > 5:
        is_garbage = True
    elif space_ratio < 0.06 and avg_len > 14:
        is_garbage = True
    elif avg_len > 20:
        is_garbage = True
    elif garbled_ratio > 0.35:
        is_garbage = True
    elif alpha_ratio < 0.15 and len(words) > 10 and dict_ratio < 0.03:
        is_garbage = True
    elif len(words) < 8 and avg_len > 12 and dict_ratio == 0:
        is_garbage = True
    score = printable_ratio * 0.35 + min(1, space_ratio * 6) * 0.25 + min(1, dict_ratio * 8) * 0.2 + (1 - min(1, garbled_ratio * 2)) * 0.2
    score = max(0, min(1, score))
    if is_garbage:
        score = min(score, 0.35)
    return {"score": score, "is_garbage": is_garbage, "printable": printable_ratio, "space": space_ratio, "avg_len": avg_len, "dict_ratio": dict_ratio}


def is_meaningful(text: str, min_chars: int = 40) -> bool:
    if not text or len(text.strip()) < min_chars:
        return False
    q = score_quality(text)
    if q["is_garbage"]:
        return False
    if q["score"] < 0.35:
        return False
    if len(text.strip().split()) < 4 and q["dict_ratio"] == 0:  # type: ignore
        return False
    return True


@app.get("/health")
def health():
    return {
        "status": "ok",
        "docling": _HAS_DOCLING,
        "pymupdf": _HAS_PYMUPDF,
        "pillow": _HAS_PIL,
        "tesseract": _HAS_TESSERACT,
        "version": "0.2.0",
    }


@app.post("/parse")
async def parse(file: UploadFile = File(...)):
    name = file.filename or "upload.bin"
    suffix = Path(name).suffix.lower()
    raw = await file.read()
    if not raw:
        return JSONResponse({"error": "empty file"}, status_code=400)

    text = ""
    warnings: list[str] = []
    parser = "fallback"

    # Try docling first (best quality for PDF/DOCX/PPTX/images if installed)
    # Extend to images as well — docling supports OCR if configured
    if _HAS_DOCLING and _converter is not None and suffix in {".pdf", ".docx", ".pptx", ".html", ".md", ".png", ".jpg", ".jpeg", ".webp", ".tiff", ".bmp"}:
        try:
            tmp = Path(f"/tmp/securecontent-{os.getpid()}-{name}")
            tmp.write_bytes(raw)
            result = _converter.convert(str(tmp))
            candidate = result.document.export_to_markdown() if hasattr(result.document, "export_to_markdown") else str(result.document)
            candidate = normalize_text(candidate)
            q = score_quality(candidate)
            if candidate.strip() and not q["is_garbage"] and q["score"] >= 0.30:
                text = candidate
                parser = "docling"
            elif candidate.strip():
                warnings.append(f"Docling output quality low (score {q['score']:.2f}) — discarding and trying fallback")
            tmp.unlink(missing_ok=True)
        except Exception as e:
            warnings.append(f"docling failed: {e}")
            traceback.print_exc()

    # Image OCR path — Pillow + pytesseract
    if not text.strip() and suffix in {".png", ".jpg", ".jpeg", ".webp", ".tiff", ".bmp", ".gif"}:
        if _HAS_PIL and _HAS_TESSERACT:
            try:
                img = Image.open(io.BytesIO(raw))
                # Convert to grayscale and upscale small images for OCR
                if img.mode != "L":
                    img = img.convert("L")
                # upscale if too small
                w, h = img.size
                if w < 800:
                    scale = min(2, 800 / max(1, w))
                    img = img.resize((int(w * scale), int(h * scale)))
                # Simple binarization for cleaner OCR
                try:
                    img = img.point(lambda x: 255 if x > 140 else 0)
                except Exception:
                    pass
                ocr_text = pytesseract.image_to_string(img, lang="eng")
                ocr_text = normalize_text(ocr_text)
                q = score_quality(ocr_text)
                if ocr_text.strip() and len(ocr_text.strip()) >= 15 and not q["is_garbage"] and q["score"] >= 0.25:
                    text = ocr_text
                    parser = "pytesseract"
                    warnings.append(f"Image OCR via pytesseract (score {q['score']:.2f}) — verify output, OCR may have errors")
                elif ocr_text.strip():
                    warnings.append(f"Image OCR low quality (score {q['score']:.2f}) — not using; image may be photo without text")
                else:
                    warnings.append("Image OCR returned no text — image may be photo/diagram without readable text. Paste description as contextual info.")
            except Exception as e:
                warnings.append(f"pytesseract OCR failed: {e}")
        else:
            warnings.append("Image OCR not available — install pillow and pytesseract (and system tesseract-ocr) for local image OCR, or run with Docling OCR")
        # If still no text, return placeholder error so Node shows helpful message rather than garbage
        if not text.strip():
            # Don't fall through to utf8 hex — return 422 with warnings so Node can show placeholder
            # But we still want to allow Node to synthesize a metadata placeholder, so we return 422
            return JSONResponse({"error": "no extractable text — image requires OCR", "warnings": warnings, "parser": "image-ocr", "filename": name}, status_code=422)

    if not text.strip() and suffix == ".pdf" and _HAS_PYMUPDF:
        try:
            import fitz  # re-import for type checker

            doc = fitz.open(stream=raw, filetype="pdf")
            parts = [normalize_text(page.get_text("text") or "") for page in doc]
            candidate = "\n\n".join(p for p in parts if p.strip())
            q = score_quality(candidate)
            if candidate.strip() and not q["is_garbage"] and q["score"] >= 0.30:
                text = candidate
                parser = "pymupdf"
            elif candidate.strip():
                warnings.append(f"PyMuPDF text quality low (score {q['score']:.2f}) — scanned PDF likely needs OCR")
                # Try OCR on PDF pages if tesseract available
                if _HAS_PIL and _HAS_TESSERACT:
                    try:
                        ocr_parts = []
                        for page in doc:
                            pix = page.get_pixmap(dpi=150)
                            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                            t = pytesseract.image_to_string(img, lang="eng")
                            t = normalize_text(t)
                            if t.strip():
                                ocr_parts.append(t)
                        ocr_candidate = "\n\n".join(ocr_parts)
                        oq = score_quality(ocr_candidate)
                        if ocr_candidate.strip() and oq["score"] >= 0.25 and not oq["is_garbage"]:
                            text = ocr_candidate
                            parser = "pymupdf+ocr"
                            warnings.append("PyMuPDF OCR fallback succeeded")
                    except Exception as e:
                        warnings.append(f"PyMuPDF OCR failed: {e}")
            if not text.strip():
                warnings.append("PyMuPDF parsed empty text — scanned PDF may need OCR.")
        except Exception as e:
            warnings.append(f"pymupdf failed: {e}")

    if not text.strip() and suffix == ".pdf":
        # pdfminer.six fallback (pure Python, lightweight)
        try:
            from pdfminer.high_level import extract_text  # type: ignore

            candidate = normalize_text(extract_text(io.BytesIO(raw)) or "")
            q = score_quality(candidate)
            if candidate.strip() and not q["is_garbage"] and q["score"] >= 0.30:
                text = candidate
                parser = "pdfminer"
            elif candidate.strip():
                warnings.append(f"pdfminer quality low (score {q['score']:.2f}) — discarding")
        except Exception as e:
            warnings.append(f"pdfminer fallback failed: {e}")

    if not text.strip() and suffix == ".docx":
        try:
            import docx  # python-docx

            d = docx.Document(io.BytesIO(raw))
            candidate = normalize_text("\n\n".join(p.text for p in d.paragraphs if p.text.strip()))
            q = score_quality(candidate)
            if candidate.strip() and not q["is_garbage"]:
                text = candidate
                parser = "python-docx"
            elif candidate.strip():
                warnings.append(f"python-docx quality low (score {q['score']:.2f})")
        except Exception as e:
            warnings.append(f"python-docx failed: {e}")

    if not text.strip() and suffix == ".pptx":
        try:
            import pptx  # python-pptx

            prs = pptx.Presentation(io.BytesIO(raw))
            parts = []
            for slide in prs.slides:
                for shape in slide.shapes:
                    if shape.has_text_frame:
                        t = shape.text.strip()
                        if t:
                            parts.append(t)
                    if shape.has_table:
                        for row in shape.table.rows:
                            for cell in row.cells:
                                if cell.text.strip():
                                    parts.append(cell.text.strip())
            candidate = normalize_text("\n\n".join(parts))
            q = score_quality(candidate)
            if candidate.strip() and not q["is_garbage"]:
                text = candidate
                parser = "python-pptx"
            elif candidate.strip():
                warnings.append(f"python-pptx quality low (score {q['score']:.2f})")
        except Exception as e:
            warnings.append(f"python-pptx failed: {e}")

    # SVG text extraction
    if not text.strip() and suffix == ".svg":
        try:
            raw_s = raw.decode("utf-8", errors="ignore")
            # extract <text> nodes
            m = re.findall(r"<(?:text|tspan)[^>]*>([^<]+)</(?:text|tspan)>", raw_s, re.I)
            candidate = normalize_text("\n".join(t.strip() for t in m if t.strip()))
            if candidate.strip() and is_meaningful(candidate, 10):
                text = candidate
                parser = "svg-text"
            else:
                # fallback strip tags
                stripped = re.sub(r"<[^>]+>", " ", raw_s)
                stripped = normalize_text(re.sub(r"\s+", " ", stripped))
                if stripped.strip() and is_meaningful(stripped, 20):
                    text = stripped
                    parser = "svg-strip"
                else:
                    warnings.append("SVG has no extractable text nodes")
        except Exception as e:
            warnings.append(f"SVG parsing failed: {e}")

    # Do NOT fall back to raw utf8 hex for binary — return 422 with warnings
    # so the Node side can show a clean placeholder instead of obscure characters.
    if not text.strip():
        # Special case: text family files (.txt/.md/.csv/.json/.html) may be legit utf8
        if suffix in {".txt", ".md", ".csv", ".json", ".html", ".htm", ".log"}:
            try:
                candidate = normalize_text(raw.decode("utf-8", errors="ignore"))
                q = score_quality(candidate)
                if candidate.strip() and not q["is_garbage"]:
                    return {"text": candidate, "parser": "utf8", "warnings": warnings, "filename": name}
            except Exception:
                pass
        return JSONResponse({"error": "no extractable text", "warnings": warnings, "parser": parser, "filename": name}, status_code=422)

    # Final guard: never return garbage
    q = score_quality(text)
    if q["is_garbage"] or q["score"] < 0.28:
        return JSONResponse({"error": "extracted text quality too low — appears garbled", "warnings": warnings + [f"quality score {q['score']:.2f}"], "parser": parser}, status_code=422)

    return {"text": text, "parser": parser, "warnings": warnings, "filename": name}
