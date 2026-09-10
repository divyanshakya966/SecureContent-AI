// Zero-Trust output sanitization — treat LLM output as untrusted (T5).
// Strips unsafe HTML/Markdown that could be interpreted as instructions or lead to downstream injection.

const UNSAFE_HTML = /<(script|iframe|object|embed|form|meta|link|style)[\s>]/gi;
const UNSAFE_MD = /\[([^\]]+)\]\(javascript:[^)]+\)/gi;
const UNSAFE_URL_MD = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi;

export interface OutputSanitizeResult {
  sanitized: string;
  removed: { type: string; count: number }[];
  warnings: string[];
}

export function sanitizeOutputHtml(content: string): OutputSanitizeResult {
  let out = content;
  const removed: { type: string; count: number }[] = [];
  const warnings: string[] = [];

  // Strip script/iframe etc whole blocks
  const htmlRe = new RegExp(UNSAFE_HTML.source, "gi");
  const htmlMatches = out.match(htmlRe);
  if (htmlMatches) {
    removed.push({ type: "unsafe_html_tag", count: htmlMatches.length });
    warnings.push(`Removed ${htmlMatches.length} unsafe HTML tag(s) from generated output.`);
    out = out.replace(UNSAFE_HTML, "&lt;$1&gt;");
    out = out.replace(/<\/(script|iframe|object|embed|form)>/gi, "&lt;/$1&gt;");
  }

  // Strip javascript: URLs
  const jsMatches = out.match(UNSAFE_MD);
  if (jsMatches) {
    removed.push({ type: "javascript_url", count: jsMatches.length });
    warnings.push(`Removed ${jsMatches.length} javascript: URL(s) from generated output.`);
    out = out.replace(UNSAFE_MD, "[$1](#blocked)");
  }

  // Validate markdown links: ensure they are not internal/RFC1918 that leaked
  // (we keep them but flag)
  let linkWarnings = 0;
  out = out.replace(UNSAFE_URL_MD, (full, text, url) => {
    try {
      const u = new URL(url);
      if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|internal\.|intranet\.)/.test(u.hostname)) {
        linkWarnings++;
        return `[${text}](#internal-url-redacted)`;
      }
    } catch {
      // malformed URL — keep as is, DLP will handle
    }
    return full;
  });
  if (linkWarnings) {
    removed.push({ type: "internal_url_in_output", count: linkWarnings });
    warnings.push(`Redacted ${linkWarnings} internal URL(s) in generated output.`);
  }

  // Neutralize possible instruction-like markdown that survived sanitization
  // (e.g., "SYSTEM:" prefixes)
  if (/^\s*system\s*:/gim.test(out)) {
    warnings.push("Output contained 'System:'-like prefix — neutralized.");
    out = out.replace(/^\s*system\s*:/gim, "System (as data):");
  }

  return { sanitized: out, removed, warnings };
}
