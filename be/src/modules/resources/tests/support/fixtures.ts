import express from "express";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { JwtUtils } from "../../../../core/utils/jwt";
import { newObjectId } from "../../../../core/utils/object-id";
import { normalizeSearch } from "../../../../core/utils/normalize";
import { prisma } from "../../../../infrastructure/database";
import assetsRoutes from "../../../assets/assets.routes";
import resourcesRoutes from "../../resources.routes";
import adminResourcesRoutes from "../../resources.admin.routes";
import { PrismaWorkspaceRepository } from "../../../workspaces/repositories";
import { registerWorkspacePermissionResolver } from "../../../workspaces/services/workspace-permission.resolver";

export type Role = "OWNER" | "ADMIN" | "MEMBER" | "GUEST";

export function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/assets", assetsRoutes);
  app.use("/api/v1/admin/workspaces", adminResourcesRoutes);
  app.use("/api/v1", resourcesRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

/** Resolver WORKSPACE thật (ma trận vai → action của D-28) trên Prisma — `permissionService` cần nó để kiểm quyền. */
export function registerWorkspaceResolver(): void {
  registerWorkspacePermissionResolver(new PrismaWorkspaceRepository());
}

export function tokenFor(userId: string, role = "user"): string {
  return JwtUtils.generateAccessToken({ userId, email: `${userId}@e.com`, name: "T", role, sv: 1 });
}

export async function seedUser(name = "Nguyễn Văn A"): Promise<string> {
  const id = newObjectId();
  await prisma.user.create({ data: { id, email: `${id}@e.com`, name, normalizedName: normalizeSearch(name) } });
  return id;
}

export async function seedWorkspace(ownerId: string, status: "ACTIVE" | "ARCHIVED" = "ACTIVE"): Promise<string> {
  const id = newObjectId();
  await prisma.workspace.create({
    data: { id, name: "Nhóm test", normalizedName: "nhom test", ownerId, status, memberCount: 1 },
  });
  await prisma.workspaceMembership.create({ data: { workspaceId: id, userId: ownerId, role: "OWNER", status: "ACTIVE" } });
  return id;
}

export async function addMember(
  workspaceId: string,
  userId: string,
  role: Role,
  status: "ACTIVE" | "LEFT" | "REMOVED" = "ACTIVE"
): Promise<void> {
  await prisma.workspaceMembership.create({ data: { workspaceId, userId, role, status } });
}

/** Asset READY sẵn trong DB (bỏ qua luồng upload) — cho test không phải về upload. */
export async function seedReadyAsset(input: {
  ownerId: string;
  workspaceId: string;
  name?: string;
  mime?: string;
  size?: number;
  kind?: "FILE" | "IMAGE" | "VIDEO" | "AUDIO";
}): Promise<string> {
  const id = newObjectId();
  await prisma.asset.create({
    data: {
      id,
      ownerId: input.ownerId,
      workspaceId: input.workspaceId,
      scope: "RESOURCE",
      kind: input.kind ?? "FILE",
      uploadMethod: "PRESIGNED_PUT",
      mime: input.mime ?? "application/pdf",
      declaredSize: input.size ?? 1000,
      size: input.size ?? 1000,
      originalName: input.name ?? "bai-giang.pdf",
      storageKey: `test/resource/${id}/original.bin`,
      status: "READY",
      readyAt: new Date(),
    },
  });
  return id;
}

/** `global-setup` chỉ khởi Mongo RỖNG (không `db push`) — tự tạo unique index thật cho ST-11 và race `assetId`. */
export async function ensureIndexes(): Promise<void> {
  await prisma.$runCommandRaw({
    createIndexes: "Folder",
    indexes: [
      {
        key: { workspaceId: 1, parentKey: 1, nameKey: 1 },
        name: "Folder_workspaceId_parentKey_nameKey_key",
        unique: true,
      },
    ],
  });
  await prisma.$runCommandRaw({
    createIndexes: "Resource",
    indexes: [{ key: { assetId: 1 }, name: "Resource_assetId_key", unique: true }],
  });
  // `SystemConfig.key @unique` — thiếu index thì 2 admin cùng "tạo" khoá `resource` lần đầu sinh 2 tài liệu (chỉ ở Mongo test rỗng).
  await prisma.$runCommandRaw({
    createIndexes: "SystemConfig",
    indexes: [{ key: { key: 1 }, name: "SystemConfig_key_key", unique: true }],
  });
}

export async function cleanupWorkspaces(workspaceIds: string[], userIds: string[]): Promise<void> {
  if (workspaceIds.length > 0) {
    const resources = await prisma.resource.findMany({ where: { workspaceId: { in: workspaceIds } }, select: { id: true } });
    const resourceIds = resources.map((r) => r.id);
    await prisma.outboxEvent.deleteMany({ where: { aggregateType: { in: ["Resource", "Folder"] } } });
    await prisma.assetLink.deleteMany({ where: { OR: [{ scopeId: { in: workspaceIds } }, { targetId: { in: resourceIds } }] } });
    await prisma.asset.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.resource.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.folder.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.workspaceMembership.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
  }
  if (userIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}
