import { PrismaClient } from "@prisma/client";
import keys from "../keys";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      keys.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (keys.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
