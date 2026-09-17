import type { ViewKey } from "@/lib/store";

export const ROUTES: Record<ViewKey, string> = {
  dashboard: "/",
  upload: "/ingest",
  documents: "/documents",
  document: "/documents",
  intelligence: "/intelligence",
  "policy-compare": "/policy-lab",
  policies: "/policies",
  audit: "/audit",
  architecture: "/architecture",
};

export function documentPath(id: string): string {
  return `/documents/${encodeURIComponent(id)}`;
}

export function viewFromPathname(pathname: string | null): ViewKey {
  if (!pathname || pathname === "/") return "dashboard";
  if (pathname === "/ingest") return "upload";
  if (pathname === "/documents") return "documents";
  if (pathname.startsWith("/documents/")) return "document";
  if (pathname === "/intelligence") return "intelligence";
  if (pathname === "/policy-lab") return "policy-compare";
  if (pathname === "/policies") return "policies";
  if (pathname === "/audit") return "audit";
  if (pathname === "/architecture") return "architecture";
  return "dashboard";
}

export function isDocumentsSection(pathname: string | null): boolean {
  return pathname === "/documents" || !!pathname?.startsWith("/documents/");
}
