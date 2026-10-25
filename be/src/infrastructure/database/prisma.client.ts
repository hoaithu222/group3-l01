import { PrismaClient } from "@prisma/client";
import { logger } from "../logger";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

/**
 * PrismaClient singleton — tránh nhiều connection trong hot-reload dev.
 * Production: tạo mới 1 lần, dev: tái dùng instance từ global.
 */
function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log:
      process.env["NODE_ENV"] === "development"
        ? ["info", "warn", "error"]
        : ["warn", "error"],
  });
  return client;
}

export const prisma: PrismaClient = global.__prisma ?? createPrismaClient();

if (process.env["NODE_ENV"] !== "production") {
  global.__prisma = prisma;
}

/**
 * Kết nối Prisma — gọi khi khởi động server.
 */
export async function connectPrisma(): Promise<void> {
  try {
    await prisma.$connect();
    logger.info("Prisma đã kết nối database");
  } catch (err) {
    logger.error("Prisma kết nối thất bại:", err);
    throw err;
  }
}

/**
 * Ngắt kết nối Prisma — gọi khi tắt server.
 */
export async function disconnectPrisma(): Promise<void> {
  try {
    await prisma.$disconnect();
    logger.info("Prisma đã ngắt kết nối");
  } catch (err) {
    logger.warn("Prisma ngắt kết nối thất bại:", err);
  }
}
