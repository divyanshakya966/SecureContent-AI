# Ingestion & Parsing — SecureContent AI

## Local parsers (default, zero heavy deps)

`src/lib/parsers.ts` handles the **T2: Backend → Parser** boundary:

- **Validation:** 10 MB limit, MIME allowlist, word-boundary checks before regex, parser errors caught and surfaced as `warnings` rather than 500s.
- **Text-family** (TXT/MD/CSV/JSON/`text/*`): direct UTF-8, printable-ratio heuristic warns if binary was mislabeled.
- **PDF:** `pdf-parse` (`Buffer` from `file.arrayBuffer()`). On failure falls back to a heuristic that extracts strings between `(` and `)` (BT/ET blocks) — incomplete but not empty.
- **DOCX:** `mammoth` (`extractRawText`). Warnings from `result.messages` are preserved in `metadata.warnings`.
- **Images (PNG/JPG/WEBP/TIFF):** placeholder text explaining OCR is not bundled to keep the image lightweight. The document is still ingested and scanned (so injections inside alt-text or surrounding prose are caught) but the image pixels are not OCR'd.
- **PPTX:** placeholder — convert to PDF/DOCX or use Docling for slide extraction.

Metadata captured: `parser`, `sha256`, `pages`, `sections`, `charCount`, `wordCount`, `warnings`, `mimeType`.

## Optional Docling worker

For superior PDF/PPTX/image parsing on the same machine (Fedora/Windows/WSL):

```bash
cd mini-services/docling-worker
python -m venv .venv
# activate:  source .venv/bin/activate  (Windows: .venv\Scripts\activate)
pip install -r requirements.txt
# optional heavy parsers:
pip install docling pymupdf pdfminer.six python-docx

uvicorn app:app --host 127.0.0.1 --port 8001 --reload
```

Set in `.env`:

```
DOCLING_WORKER_URL=http://localhost:8001/parse
```

`parsers.ts` will `POST` the file there with a 15s timeout and, on success, use the returned `text`. On failure or timeout it falls back to the in-JS parsers — the app never hard-fails because the worker is down.

Worker priority:

1. **Docling** (`DocumentConverter`) — best for PDF/DOCX/PPTX/HTML/MD
2. **PyMuPDF** (`fitz`) — fast PDF text extraction when docling is not installed
3. **pdfminer.six** — pure-Python fallback
4. **python-docx** — DOCX fallback
5. **UTF-8** — final heuristic

See `mini-services/docling-worker/README.md` for Docker (`--profile docling`).

## Tuning

- **Size limit:** `MAX_BYTES` in `parsers.ts` (default 10 MB). Lower it for the PPT demo.
- **MIME allowlist:** `ALLOWED_MIME_PREFIXES` / `ALLOWED_MIME_EXACT`.
- **Warnings:** surfaced in `metadata.warnings` and included in the audit log detail for reviewers.

## What is NOT done locally (by design)

- No Tesseract.js bundled — adds ~5 MB WASM and is slow on large scanned PDFs. Use Docling worker with an OCR model instead.
- No LibreOffice/unoconv — heavy native deps, unreliable in Docker on Windows.
- No full malware scan — mention as a deployment-layer `T2` control in your PPT, but do not claim coverage unless you test it.
