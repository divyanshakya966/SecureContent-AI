# Docling Worker (optional)

This is a **purely optional** microservice. The main Next.js app works completely without it (it uses `pdf-parse` + `mammoth` in-process for PDF/DOCX).

Run it only if you need superior parsing for complex PDFs, PPTX, or image OCR.

## Quick start (Fedora / Windows / WSL)

```bash
cd mini-services/docling-worker
python -m venv .venv
# Windows: .venv\Scripts\activate  |  Fedora: source .venv/bin/activate
pip install -r requirements.txt
# Optional heavy parsers (install only if you want them):
pip install docling pymupdf pdfminer.six python-docx

uvicorn app:app --host 127.0.0.1 --port 8001 --reload
```

Set in your project root `.env`:

```
DOCLING_WORKER_URL=http://localhost:8001/parse
```

Restart `bun run dev` — uploads of PDF/DOCX/PPTX will now be proxied here first, falling back to the in-JS parsers when the worker is down.
