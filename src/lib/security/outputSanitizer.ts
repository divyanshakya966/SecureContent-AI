// Zero-Trust output sanitization — treat LLM output as untrusted (T5).
// Strips unsafe HTML/Markdown that could be interpreted as instructions or lead to downstream injection.
// This is a deterministic last-mile filter — not a replacement for DLP.

const UNSAFE_HTML = /<(script|iframe|object|embed|form|meta|link|style|svg|math)[\s>]/gi;
const UNSAFE_MD = /\[([^\]]+)\]\(javascript:[^)]+\)/gi;
const UNSAFE_URL_MD = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi;
const INTERNAL_HOST_RE =
  /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.|0\.0\.0\.0|localhost$|::1$|internal\.|intranet\.)/i;

export interface OutputSanitizeResult {
  sanitized: string;
  removed: { type: string; count: number }[];
  warnings: string[];
}

export function sanitizeOutputHtml(content: string): OutputSanitizeResult {
  let out = content;
  const removed: { type: string; count: number }[] = [];
  const warnings: string[] = [];

  // Strip script/iframe/svg etc whole blocks
  const htmlRe = new RegExp(UNSAFE_HTML.source, "gi");
  const htmlMatches = out.match(htmlRe);
  if (htmlMatches) {
    removed.push({ type: "unsafe_html_tag", count: htmlMatches.length });
    warnings.push(`Removed ${htmlMatches.length} unsafe HTML tag(s) from generated output.`);
    out = out.replace(UNSAFE_HTML, "&lt;$1&gt;");
    out = out.replace(/<\/(script|iframe|object|embed|form|svg|math|style)>/gi, "&lt;/$1&gt;");
  }

  // Strip javascript: URLs
  const jsMatches = out.match(UNSAFE_MD);
  if (jsMatches) {
    removed.push({ type: "javascript_url", count: jsMatches.length });
    warnings.push(`Removed ${jsMatches.length} javascript: URL(s) from generated output.`);
    out = out.replace(UNSAFE_MD, "[$1](#blocked)");
  }

  // Validate markdown links: ensure they are not internal/RFC1918 that leaked
  let linkWarnings = 0;
  out = out.replace(UNSAFE_URL_MD, (full, text, url) => {
    try {
      const u = new URL(url);
      if (INTERNAL_HOST_RE.test(u.hostname) || INTERNAL_HOST_RE.test(url)) {
        linkWarnings++;
        return `[${text}](#internal-url-redacted)`;
      }
    } catch {
      // malformed URL — keep as is, DLP will handle
    }
    return full;
  });

  // Strip event-handler attributes and data: URLs that bypass javascript: check
  const eventAttrRe = /\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
  const eventMatches = out.match(eventAttrRe);
  if (eventMatches) {
    removed.push({ type: "event_handler_attr", count: eventMatches.length });
    warnings.push(`Removed ${eventMatches.length} event-handler attribute(s) from generated output.`);
    out = out.replace(eventAttrRe, "");
  }
  const dataUrlRe = /\[([^\]]+)\]\(data:[^)]+\)/gi;
  const dataMatches = out.match(dataUrlRe);
  if (dataMatches) {
    removed.push({ type: "data_url", count: dataMatches.length });
    warnings.push(`Removed ${dataMatches.length} data: URL(s) from generated output.`);
    out = out.replace(dataUrlRe, "[$1](#blocked)");
  }
  if (linkWarnings) {
    removed.push({ type: "internal_url_in_output", count: linkWarnings });
    warnings.push(`Redacted ${linkWarnings} internal URL(s) in generated output.`);
  }

  // Neutralize instruction-like role prefixes that survived sanitization
  if (/^\s*(system|assistant|user)\s*:/gim.test(out)) {
    warnings.push("Output contained role-like prefix — neutralized.");
    out = out.replace(/^\s*system\s*:/gim, "System (as data):");
    out = out.replace(/^\s*assistant\s*:/gim, "Assistant (as data):");
    out = out.replace(/^\s*user\s*:/gim, "User (as data):");
  }
  // Strip HTML comments that could hide instructions
  const commentRe = /<!--[\s\S]*?-->/g;
  const commentMatches = out.match(commentRe);
  if (commentMatches) {
    removed.push({ type: "html_comment", count: commentMatches.length });
    warnings.push(`Removed ${commentMatches.length} HTML comment(s) from generated output.`);
    out = out.replace(commentRe, "");
  }

  // Strip control / zero-width / replacement chars that render as obscure boxes
  const beforeCtrl = out.length;
  out = out.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\u200B-\u200D\uFEFF\uFFFD]/g, "");
  if (out.length !== beforeCtrl) {
    removed.push({ type: "control_chars", count: beforeCtrl - out.length });
    warnings.push(`Removed ${beforeCtrl - out.length} control/zero-width character(s) from generated output.`);
  }

  return { sanitized: out, removed, warnings };
}
