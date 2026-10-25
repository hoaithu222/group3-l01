/**
 * Bộ dựng dùng chung cho test tích hợp ví: seed user/workspace/membership, gọi API, dọn dữ liệu.
 * KHÔNG phải test (không khớp `*.test.ts`).
 */
import express from "express";
import request from "supertest";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { JwtUtils } from "../../../../core/utils/jwt";
import { newObjectId } from "../../../../core/utils/object-id";
import { prisma } from "../../../../infrastructure/database";
import walletRoutes from "../../wallet.routes";
import adminWalletRoutes from "../../admin-wallet.routes";

export type Role = "OWNER" | "ADMIN" | "MEMBER" | "GUEST";

export interface Group {
  workspaceId: string;
  ids: Record<string, string>;
}

export function buildWalletApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1", walletRoutes);
  app.use("/api/v1", adminWalletRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

export function tokenFor(userId: string, role = "user"): string {
  return JwtUtils.generateAccessToken({ userId, email: `${userId}@e.com`, name: "T", role, sv: 1 });
}

/** Tạo workspace + user + membership. `spec`: tên → vai trò (mặc định MEMBER). */
export async function seedGroup(spec: Record<string, Role>): Promise<Group> {
  const workspaceId = newObjectId();
  const ids: Record<string, string> = {};
  for (const [name, role] of Object.entries(spec)) {
    const id = newObjectId();
    ids[name] = id;
    await prisma.user.create({ data: { id, email: `${id}@e.com`, name: `Người ${name}` } });
    await prisma.workspaceMembership.create({ data: { workspaceId, userId: id, role, status: "ACTIVE" } });
  }
  const ownerId = ids[Object.keys(spec).find((n) => spec[n] === "OWNER") ?? Object.keys(spec)[0]];
  await prisma.workspace.create({
    data: { id: workspaceId, name: `Ví ${workspaceId.slice(-6)}`, normalizedName: `vi ${workspaceId.slice(-6)}`, ownerId, status: "ACTIVE" },
  });
  return { workspaceId, ids };
}

/** Xoá mọi dữ liệu do test tạo (theo workspace/user) — không đụng dữ liệu của test khác. */
export async function cleanupGroups(groups: Group[]): Promise<void> {
  if (groups.length === 0) return;
  const wsIds = groups.map((g) => g.workspaceId);
  const userIds = groups.flatMap((g) => Object.values(g.ids));
  const notifs = await prisma.notification.findMany({ where: { workspaceId: { in: wsIds } }, select: { id: true } });

  await prisma.walletBalance.deleteMany({ where: { workspaceId: { in: wsIds } } });
  await prisma.expenseShare.deleteMany({ where: { workspaceId: { in: wsIds } } });
  await prisma.workspaceExpense.deleteMany({ where: { workspaceId: { in: wsIds } } });
  await prisma.settlement.deleteMany({ where: { workspaceId: { in: wsIds } } });
  await prisma.workspaceWallet.deleteMany({ where: { workspaceId: { in: wsIds } } });
  await prisma.userPaymentProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.notificationRecipient.deleteMany({ where: { workspaceId: { in: wsIds } } });
  await prisma.notification.deleteMany({ where: { workspaceId: { in: wsIds } } });
  await prisma.outboxEvent.deleteMany({
    where: { OR: [{ aggregateId: { in: wsIds } }, ...notifs.map((n) => ({ aggregateId: { startsWith: n.id } }))] },
  });
  await prisma.workspaceMembership.deleteMany({ where: { workspaceId: { in: wsIds } } });
  await prisma.workspace.deleteMany({ where: { id: { in: wsIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

export function expenseBody(paidBy: string, participants: string[], over: Record<string, unknown> = {}) {
  return {
    amount: 150_000,
    description: "Ăn trưa nhóm",
    category: "FOOD",
    paidBy,
    occurredAt: new Date().toISOString(),
    splitType: "EQUAL",
    participants: participants.map((userId) => ({ userId })),
    ...over,
  };
}

export type Api = (method: "get" | "post" | "put" | "patch" | "delete", path: string, token: string, body?: unknown, headers?: Record<string, string>) => request.Test;

export function makeApi(app: ReturnType<typeof buildWalletApp>): Api {
  return (method, path, token, body, headers) => {
    let req = request(app)[method](`/api/v1${path}`).set("Authorization", `Bearer ${token}`);
    for (const [k, v] of Object.entries(headers ?? {})) req = req.set(k, v);
    return body === undefined ? req : req.send(body as object);
  };
}
