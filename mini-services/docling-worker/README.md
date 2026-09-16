# Docling Worker (optional — but gives best-quality, scanned-PDF & image OCR)

This microservice is **purely optional**. The main Next.js app works without it: it uses `pdf-parse`+quality gate, `mammoth`, `jszip` (PPTX) and `tesseract.js`+`sharp` (image OCR) locally and never shows obscure characters. Enable the worker for superior layout fidelity and faster OCR on scanned PDFs / images.

Run it only if you want best quality for complex PDFs, PPTX, or photo scans.

## Quick start (Fedora / Windows / WSL)

```bash
cd mini-services/docling-worker
python -m venv .venv
# Windows: .venv\Scripts\activate  |  Fedora: source .venv/bin/activate
pip install -r requirements.txt
# Pick what you need (base runs without heavy deps):
pip install pymupdf pdfminer.six python-docx python-pptx pillow pytesseract
# System OCR (for image/PDF OCR):
# Fedora: sudo dnf install tesseract tesseract-langpack-eng
# Ubuntu: sudo apt install tesseract-ocr
# Optional full layout: pip install docling

uvicorn app:app --host 127.0.0.1 --port 8001 --reload
# Check: curl http://localhost:8001/health  — should show {"docling":..., "pymupdf":true, "pillow":true, "tesseract":true}
```

Set in your project root `.env`:

```
DOCLING_WORKER_URL=http://localhost:8001/parse
```

Restart `bun run dev` — uploads of PDF/DOCX/PPTX/images will now be proxied here first (20s timeout, SSRF-guarded). Every extraction is `normalize_text` + `score_quality` filtered — garbled CID/hex is discarded (never returns obscure). Fallback chain:

```
Docling (PDF/DOCX/PPTX/images) → Pillow+pytesseract (images, PDF pages @150dpi) → PyMuPDF → pdfminer → python-docx/pptx → SVG <text> → UTF-8 → 422 with warnings (Node then uses local tesseract.js/jszip/mammoth)
```

If both worker and local yield no text, the Node side shows a clean metadata placeholder (`[Image: file — PNG 800x600]`) instead of `PJYI~` or `�` — still scannable (LOW risk) and transformable once transcript is pasted. See `docs/ingestion.md`.
