import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <img src="/logo.svg" alt="SecureContent AI" className="mx-auto h-12 w-12 rounded-xl shadow-sm" />
        <h1 className="mt-4 text-lg font-semibold tracking-tight">Page not found</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          The address doesn&apos;t match anything in this workspace. Documents you ingested are safe.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Link
            href="/"
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            Overview
          </Link>
          <Link
            href="/documents"
            className="inline-flex h-9 items-center rounded-md border border-border bg-card px-4 text-sm font-medium transition-colors hover:bg-muted"
          >
            Documents
          </Link>
        </div>
      </div>
    </div>
  );
}
