"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <img src="/logo.svg" alt="SecureContent AI" className="mx-auto h-12 w-12 rounded-xl shadow-sm" />
        <h1 className="mt-4 text-lg font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          This section failed to render. Your documents and audit trail are unaffected.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <button
            onClick={reset}
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex h-9 items-center rounded-md border border-border bg-card px-4 text-sm font-medium transition-colors hover:bg-muted"
          >
            Overview
          </Link>
        </div>
      </div>
    </div>
  );
}
