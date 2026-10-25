export { prisma, connectPrisma, disconnectPrisma } from "./prisma.client";
export { withTransaction } from "./transaction";

/**
 * Kết nối DB (Prisma). Alias giữ backward-compat với server.ts.
 */
export async function connectDatabase(): Promise<void> {
  const { connectPrisma } = await import("./prisma.client");
  await connectPrisma();
}

/**
 * Ngắt kết nối DB. Gọi khi graceful shutdown.
 */
export async function disconnectDatabase(): Promise<void> {
  const { disconnectPrisma } = await import("./prisma.client");
  await disconnectPrisma();
}
