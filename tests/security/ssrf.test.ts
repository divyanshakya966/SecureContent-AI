import { describe, it, expect } from "vitest";
import { isAllowedDoclingUrl } from "@/lib/parsers";

describe("Docling worker SSRF allowlist", () => {
  it("allows loopback, private nets, and compose service names", () => {
    expect(isAllowedDoclingUrl("http://localhost:8001/parse")).toBe(true);
    expect(isAllowedDoclingUrl("http://127.0.0.1:8001/parse")).toBe(true);
    expect(isAllowedDoclingUrl("http://10.0.2.5:8001/parse")).toBe(true);
    expect(isAllowedDoclingUrl("http://192.168.1.10:8001/parse")).toBe(true);
    expect(isAllowedDoclingUrl("http://172.20.0.3:8001/parse")).toBe(true);
    expect(isAllowedDoclingUrl("http://docling:8001/parse")).toBe(true);
    expect(isAllowedDoclingUrl("http://host.docker.internal:8001/parse")).toBe(true);
    expect(isAllowedDoclingUrl("http://worker/parse")).toBe(true);
    expect(isAllowedDoclingUrl("https://[::1]:8001/parse")).toBe(true);
  });

  it("blocks metadata, unspecified, public, and credentialed URLs", () => {
    expect(isAllowedDoclingUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isAllowedDoclingUrl("http://0.0.0.0:8001/parse")).toBe(false);
    expect(isAllowedDoclingUrl("http://8.8.8.8/parse")).toBe(false);
    expect(isAllowedDoclingUrl("http://93.184.216.34/parse")).toBe(false);
    expect(isAllowedDoclingUrl("http://example.com/parse")).toBe(false);
    expect(isAllowedDoclingUrl("http://evil.internal.evil.com/parse")).toBe(false); // suffix trick — only exact *.internal apex allowed via DOCLING_ALLOWED_HOSTS
    expect(isAllowedDoclingUrl("http://svc.internal/parse")).toBe(true); // single-level .internal service name
    expect(isAllowedDoclingUrl("ftp://localhost/parse")).toBe(false);
    expect(isAllowedDoclingUrl("http://user:pass@localhost:8001/parse")).toBe(false);
    expect(isAllowedDoclingUrl("not-a-url")).toBe(false);
    expect(isAllowedDoclingUrl("http://100.64.0.1/parse")).toBe(false); // CGNAT — deny
    expect(isAllowedDoclingUrl("http://[::ffff:127.0.0.1]/parse")).toBe(false);
  });
});
