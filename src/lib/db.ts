import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

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