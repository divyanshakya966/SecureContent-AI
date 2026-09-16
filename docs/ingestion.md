# Ingestion — Source Content Intake

The platform accepts the operator's **source content** in any of the forms described in the spec: high-quality English text, documents, articles, reports, prompts, images, videos or contextual information submitted via the dashboard (file upload or paste).

`src/lib/parsers.ts` is the **T2 trust boundary** (Backend → Parser). All parsers run isolated with size/MIME validation and SSRF-guarded optional Docling proxy.

## Supported Sources — Good Content Processing Pipeline

| Source (as per spec) | MIME / Extension | Parser & Handling (never obscure) |
|---|---|---|
| **Text / Prompts / Contextual info** | `text/*`, `application/json`, `application/csv`, paste | Direct UTF-8, NFC-normalized, control/zero-width stripped, binary detection + `scoreTextQuality` garbage filter |
| **Documents** — articles, reports, advisories, policy docs, research papers | `TXT/MD/CSV/JSON/HTML` | Direct UTF-8 + quality gate; `isProbablyBinaryText` prevents PJYI~ hex dumps |
| **Documents** — PDF | `application/pdf`, `.pdf` | **Cascade:** Docling (if `DOCLING_WORKER_URL`) → `pdf-parse` + `scoreTextQuality` → scanned-PDF OCR hint. Garbled CID/embedded-font output is scored and discarded (never surfaced as obscure); user gets actionable warning. Scanned PDFs auto-OCR via Docling `pymupdf+pytesseract` or `pdfminer` fallback. |
| **Documents** — DOCX | `vnd.openxmlformats-officedocument.wordprocessingml.document` | `mammoth` + quality gate; Docling fallback for complex |
| **Documents** — PPTX | `vnd.openxmlformats-officedocument.presentationml.presentation` | **NEW:** Local `jszip` XML extraction (`ppt/slides/slide*.xml` → `<a:t>` nodes) + Docling/ `python-pptx` fallback. No more placeholder-only — yields real slide text or clear warning. |
| **Images** — PNG/JPG/WebP/SVG/TIFF/BMP | `image/*` | **NEW:** Docling OCR → local `tesseract.js` + `sharp` preprocessing (grayscale/normalize/upscale) → metadata-rich placeholder (`[Image: file — PNG 800x600]`) if OCR unavailable. SVG extracts `<text>`/`<tspan>` nodes. Never returns binary hex. Quality `scoreTextQuality` filters OCR noise. |
| **Video / Audio** — MP4/MOV/WebM/MP3/WAV | `video/*`, `audio/*` | Metadata placeholder (`[Video/Audio: file]`) with transcript guidance; paste transcript for full pipeline. Same guidance prevents obscure. |

> **Quality gate (both Node & Docling worker):** Every extraction is scored (`printableRatio`, `spaceRatio`, `avgWordLen`, `garbledRatio`, `dictionaryRatio`). Garbage (`score <0.30` or `isGarbage`) is discarded and never stored as `rawContent` — the UI shows `No extractable text — enable OCR` instead of `�` boxes. Secrets/PII heavy docs are allow-listed to avoid false filtering.

**Pipeline order (Next.js):** `size/MIME validate → Docling worker (20s, SSRF-guarded, images+PDF+PPTX) → local parser (pdf-parse/mammoth/jszip/svg/sharp+tesseract) → normalizeIngestedText → scoreTextQuality → placeholder if empty` — ensures *any* uploaded file yields meaningful scanning input (either extracted text or clean metadata placeholder), never unrecognizable format.

**Limits:** `MAX_BYTES = 25 MB` (covers short video/audio clips; larger files should use chunked upload). All MIME types validated against allowlist; unrecognized types warn and fall back to UTF-8 with binary detection (`isProbablyBinaryText`).

**Metadata emitted:** `parser, sha256, pages, sections, charCount, wordCount, warnings, byteLength` → stored in `Document.metadata` and audit log. Warnings surface in UI (`No extractable text — enable Docling` instead of obscure characters).

## Docling Worker (Optional — enables high-fidelity OCR & scanned PDF/Video)

```bash
cd mini-services/docling-worker
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# Pick what you need (base worker runs without heavy deps):
pip install pymupdf pdfminer.six python-docx python-pptx pillow pytesseract
# For system OCR: sudo dnf install tesseract tesseract-langpack-eng  |  sudo apt install tesseract-ocr
# Optional full: pip install docling

uvicorn app:app --host 127.0.0.1 --port 8001
```

Set `DOCLING_WORKER_URL=http://localhost:8001/parse` in `.env`. **New fallback chain (with quality gate):**

```
Docling (images/PDF/DOCX/PPTX/HTML/MD) →
  Image: Pillow + pytesseract (grayscale, upscale, binarize) →
  PDF: PyMuPDF → PyMuPDF+OCR (render @150dpi + pytesseract per page) → pdfminer →
  DOCX: python-docx → PPTX: python-pptx → SVG: <text> extraction →
  Text: UTF-8 (quality scored) → else 422 with warnings (never hex/garbled)
```

Timeout 20s, SSRF-guarded (http/https only, FormData proxy). Every candidate is normalized and scored (`scoreTextQuality`) — low-quality (garbled CID, hex) is discarded and the Node side falls back to local `tesseract.js`/`jszip`/`mammoth` instead of surfacing obscure characters. See `mini-services/docling-worker/README.md` for toggles.

**Local fallback without worker:** `bun add tesseract.js jszip sharp` already done — images OCR via `tesseract.js`+`sharp`, PPTX via `jszip`, PDF via `pdf-parse`+quality filter. No obscure output even when worker is down; worker just adds layout fidelity and faster OCR.

## After Ingestion — Configurable Transformation

Once scanned (`SCANNED`), the operator opens the document → **Transform** tab and configures:

- **One or more output types** (15): Executive Summary, FAQ, Technical Report, Slide Outline, Email Draft, Press Release, Social Post, Newsletter, Policy Brief, Training Guide, Incident Summary, Research Digest, Announcement, Blog Post, Meeting Minutes
- **Generation parameters:** target audience (profile), tone, language, level of detail, communication objective, content style

The platform then generates each artefact via the **sanitized working copy only** (`<UNTRUSTED_DOCUMENT>` envelope) and validates before delivery.

## Tuning

- `MAX_BYTES` and `ALLOWED_MIME_EXACT / ALLOWED_MIME_PREFIXES` in `parsers.ts`
- `DOCLING_WORKER_URL` for OCR/transcription quality
- Warnings in `metadata.warnings` and audit log; UI shows `sanitizeForDisplay` with `[overflow-wrap:anywhere]`
