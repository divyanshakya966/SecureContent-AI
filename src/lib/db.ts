import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function resolveDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.warn("[db] DATABASE_URL is not set — Prisma will use the default from schema.prisma. Set DATABASE_URL=file:./prisma/dev.db for local or postgresql:// for production.");
  }
  return url || undefined;
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"],
    ...(resolveDatabaseUrl() ? {} : {}),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export async function checkDatabaseHealth(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - start, error: e instanceof Error ? e.message : String(e) };
  }
}

// Graceful shutdown — close Prisma on process exit (important for serverless/standalone).
if (typeof process !== "undefined" && process.on) {
  const shutdown = async () => {
    try {
      await db.$disconnect();
    } catch {
      // ignore
    }
  };
  process.on("beforeExit", shutdown);
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}