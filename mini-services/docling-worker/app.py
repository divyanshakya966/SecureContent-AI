"""
SecureContent AI — Optional Docling ingestion worker

Run locally for higher-quality PDF/DOCX/PPTX/image parsing:

  pip install -r requirements.txt
  uvicorn app:app --host 127.0.0.1 --port 8001

Set DOCLING_WORKER_URL=http://localhost:8001/parse in your .env
and the Next.js upload route will proxy binary files here first.

If Docling itself is installed, it is used; otherwise the worker falls back
to pdfminer / python-docx / plain text heuristics so the service stays useful
without heavy model downloads.
"""

from __future__ import annotations

import io
import mimetypes
import os
import traceback
from pathlib import Path

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse

app = FastAPI(title="SecureContent AI — Docling Worker", version="0.1.0")

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


@app.get("/health")
def health():
    return {
        "status": "ok",
        "docling": _HAS_DOCLING,
        "pymupdf": _HAS_PYMUPDF,
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

    # Try docling first (best quality for PDF/DOCX/PPTX)
    if _HAS_DOCLING and _converter is not None and suffix in {".pdf", ".docx", ".pptx", ".html", ".md"}:
        try:
            tmp = Path(f"/tmp/securecontent-{os.getpid()}-{name}")
            tmp.write_bytes(raw)
            result = _converter.convert(str(tmp))
            text = result.document.export_to_markdown() if hasattr(result.document, "export_to_markdown") else str(result.document)
            parser = "docling"
            tmp.unlink(missing_ok=True)
        except Exception as e:
            warnings.append(f"docling failed: {e}")
            traceback.print_exc()

    if not text.strip() and suffix == ".pdf" and _HAS_PYMUPDF:
        try:
            import fitz  # re-import for type checker

            doc = fitz.open(stream=raw, filetype="pdf")
            parts = [page.get_text("text") for page in doc]
            text = "\n\n".join(p for p in parts if p.strip())
            parser = "pymupdf"
            if not text.strip():
                warnings.append("PyMuPDF parsed empty text — scanned PDF may need OCR.")
        except Exception as e:
            warnings.append(f"pymupdf failed: {e}")

    if not text.strip() and suffix == ".pdf":
        # pdfminer.six fallback (pure Python, lightweight)
        try:
            from pdfminer.high_level import extract_text  # type: ignore

            text = extract_text(io.BytesIO(raw)) or ""
            if text.strip():
                parser = "pdfminer"
        except Exception as e:
            warnings.append(f"pdfminer fallback failed: {e}")

    if not text.strip() and suffix == ".docx":
        try:
            import docx  # python-docx

            d = docx.Document(io.BytesIO(raw))
            text = "\n\n".join(p.text for p in d.paragraphs if p.text.strip())
            if text.strip():
                parser = "python-docx"
        except Exception as e:
            warnings.append(f"python-docx failed: {e}")

    if not text.strip():
        # Final heuristic: treat as utf-8 text, or fall back to hex snippet
        try:
            text = raw.decode("utf-8", errors="ignore")
            parser = "utf8"
        except Exception:
            text = raw[:4000].hex()
            parser = "hex"

    if not text.strip():
        return JSONResponse({"error": "no extractable text", "warnings": warnings}, status_code=422)

    return {"text": text, "parser": parser, "warnings": warnings, "filename": name}
