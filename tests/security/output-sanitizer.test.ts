import { describe, it, expect } from "vitest";
import { sanitizeOutputHtml } from "@/lib/security/outputSanitizer";

describe("output sanitizer — dangerous URL attributes", () => {
  it("strips javascript:/data:/vbscript: href/src attributes", () => {
    const r = sanitizeOutputHtml('<a href="javascript:alert(1)">click</a> and <img src="data:text/html,<script>alert(1)</script>">');
    expect(r.sanitized).not.toContain("javascript:");
    expect(r.sanitized).not.toContain("data:text/html");
    expect(r.removed.some((x) => x.type === "dangerous_url_attr")).toBe(true);
  });

  it("keeps safe https links intact", () => {
    const r = sanitizeOutputHtml('[docs](https://example.com/guide) and <a href="https://example.com">ok</a>');
    expect(r.sanitized).toContain("https://example.com/guide");
  });

  it("still strips event handlers, comments, and control chars", () => {
    const r = sanitizeOutputHtml('<div onclick="evil()">x</div><!-- secret -->\u200bhi');
    expect(r.sanitized).not.toContain("onclick");
    expect(r.sanitized).not.toContain("<!--");
    expect(r.sanitized).toContain("hi");
  });

  it("redacts internal hosts in markdown links", () => {
    const r = sanitizeOutputHtml("[admin](http://192.168.1.1/admin)");
    expect(r.sanitized).toContain("#internal-url-redacted");
  });
});
