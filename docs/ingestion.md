# Ingestion — Source Content Intake

The platform accepts the operator's **source content** in any of the forms described in the spec: high-quality English text, documents, articles, reports, prompts, images, videos or contextual information submitted via the dashboard (file upload or paste).

`src/lib/parsers.ts` is the **T2 trust boundary** (Backend → Parser). All parsers run isolated with size/MIME validation and SSRF-guarded optional Docling proxy.

## Supported Sources

| Source (as per spec) | MIME / Extension | Parser & Handling |
|---|---|---|
| **Text / Prompts / Contextual info** | `text/*`, `application/json`, `application/csv`, paste | Direct UTF-8, NFC-normalized, control/zero-width stripped, binary detection |
| **Documents** — articles, reports, advisories, policy docs, research papers | `TXT/MD/CSV/JSON/HTML` | Direct UTF-8 |
| **Documents** — PDF | `application/pdf`, `.pdf` | `pdf-parse`; Docling → PyMuPDF → pdfminer for scanned/complex (15s timeout) |
| **Documents** — DOCX | `vnd.openxmlformats-officedocument.wordprocessingml.document` | `mammoth`; Docling for complex |
| **Documents** — PPTX | `vnd.openxmlformats-officedocument.presentationml.presentation` | Placeholder locally; Docling worker for full slide extraction |
| **Images** — PNG/JPG/WebP/SVG/TIFF | `image/*` | Placeholder locally (`[Image content placeholder — file]`); OCR via Docling/Tesseract or paste description as contextual info |
| **Video / Audio** — MP4/MOV/WebM/MP3/WAV | `video/*`, `audio/*` | Transcript placeholder locally (`[Video/Audio content placeholder — file]`); paste transcript or run Whisper worker; then transform transcript |

**Limits:** `MAX_BYTES = 25 MB` (covers short video/audio clips; larger files should use chunked upload). All MIME types validated against allowlist; unrecognized types warn and fall back to UTF-8 with binary detection (`isProbablyBinaryText`).

**Metadata emitted:** `parser, sha256, pages, sections, charCount, wordCount, warnings, byteLength` → stored in `Document.metadata` and audit log. Warnings surface in UI (`No extractable text — enable Docling` instead of obscure characters).

## Docling Worker (Optional — enables real OCR & scanned PDF/Video)

```bash
cd mini-services/docling-worker
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --port 8001
```

Set `DOCLING_WORKER_URL=http://localhost:8001/parse` in `.env`. Fallback chain: **Docling → PyMuPDF → pdfminer.six → python-docx → UTF-8**. Timeout 15s, SSRF-guarded (http/https only, FormData proxy).

## After Ingestion — Configurable Transformation

Once scanned (`SCANNED`), the operator opens the document → **Transform** tab and configures:

- **One or more output types** (15): Executive Summary, FAQ, Technical Report, Slide Outline, Email Draft, Press Release, Social Post, Newsletter, Policy Brief, Training Guide, Incident Summary, Research Digest, Announcement, Blog Post, Meeting Minutes
- **Generation parameters:** target audience (profile), tone, language, level of detail, communication objective, content style

The platform then generates each artefact via the **sanitized working copy only** (`<UNTRUSTED_DOCUMENT>` envelope) and validates before delivery.

## Tuning

- `MAX_BYTES` and `ALLOWED_MIME_EXACT / ALLOWED_MIME_PREFIXES` in `parsers.ts`
- `DOCLING_WORKER_URL` for OCR/transcription quality
- Warnings in `metadata.warnings` and audit log; UI shows `sanitizeForDisplay` with `[overflow-wrap:anywhere]`
