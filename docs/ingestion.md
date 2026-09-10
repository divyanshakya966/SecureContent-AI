# Ingestion

## Parsers

`src/lib/parsers.ts` — T2 boundary.

- **Validation:** 10 MB limit, MIME allowlist
- **TXT/MD/CSV/JSON:** Direct UTF-8
- **PDF:** `pdf-parse`; fallback heuristic on failure
- **DOCX:** `mammoth`
- **Images / PPTX:** Placeholder; scanned but not OCR'd locally (use Docling worker)

Metadata: `parser, sha256, pages, sections, charCount, wordCount, warnings`

## Docling Worker (Optional)

```bash
cd mini-services/docling-worker
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --port 8001
```

Set `DOCLING_WORKER_URL=http://localhost:8001/parse` in `.env`.

Fallback chain: Docling → PyMuPDF → pdfminer.six → python-docx → UTF-8. Timeout 15s.

## Tuning

- `MAX_BYTES` and `ALLOWED_MIME_*` in `parsers.ts`
- Warnings in `metadata.warnings` and audit log
