import express from "express";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { JwtUtils } from "../../../../core/utils/jwt";
import { newObjectId } from "../../../../core/utils/object-id";
import { normalizeSearch } from "../../../../core/utils/normalize";
import { prisma } from "../../../../infrastructure/database";
import assetsRoutes from "../../../assets/assets.routes";
import { PrismaWorkspaceRepository } from "../../../workspaces/repositories";
import { registerWorkspacePermissionResolver } from "../../../workspaces/services/workspace-permission.resolver";
import studyRoutes from "../../study.routes";
import adminStudyRoutes from "../../study.admin.routes";

export type Role = "OWNER" | "ADMIN" | "MEMBER" | "GUEST";

export function buildApp() {
  const app = express();
  app.use(express.json({ limit: "20mb" })); // như `app.ts`: parser toàn cục rộng hơn trần riêng của route (2 MB)
  app.use("/api/v1/assets", assetsRoutes);
  app.use("/api/v1", studyRoutes);
  app.use("/api/v1", adminStudyRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

/** Resolver WORKSPACE thật (ma trận vai → action của D-28) — `permissionService` cần nó để tra vai trò thành viên. */
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

export async function seedWorkspace(ownerId: string): Promise<string> {
  const id = newObjectId();
  await prisma.workspace.create({ data: { id, name: "Nhóm test", normalizedName: "nhom test", ownerId, status: "ACTIVE", memberCount: 1 } });
  await prisma.workspaceMembership.create({ data: { workspaceId: id, userId: ownerId, role: "OWNER", status: "ACTIVE" } });
  return id;
}

export async function addMember(workspaceId: string, userId: string, role: Role): Promise<void> {
  await prisma.workspaceMembership.create({ data: { workspaceId, userId, role, status: "ACTIVE" } });
}

/** Asset scope STUDY đã READY sẵn trong DB (bỏ qua luồng upload) — ảnh PNG hoặc âm thanh mp3. */
export async function seedStudyAsset(ownerId: string, kind: "IMAGE" | "AUDIO" = "IMAGE"): Promise<string> {
  const id = newObjectId();
  await prisma.asset.create({
    data: {
      id,
      ownerId,
      scope: "STUDY",
      kind,
      uploadMethod: "PRESIGNED_PUT",
      mime: kind === "IMAGE" ? "image/png" : "audio/mpeg",
      declaredSize: 2048,
      size: 2048,
      originalName: kind === "IMAGE" ? "anh.png" : "am-thanh.mp3",
      storageKey: `test/study/${id}/original.bin`,
      status: "READY",
      readyAt: new Date(),
    },
  });
  return id;
}

/** `global-setup` chỉ khởi Mongo RỖNG (không `db push`) — tự tạo các unique index mà nghiệp vụ dựa vào. */
export async function ensureIndexes(): Promise<void> {
  await prisma.$runCommandRaw({
    createIndexes: "AssetLink",
    indexes: [{ key: { assetId: 1, targetType: 1, targetId: 1 }, name: "AssetLink_assetId_targetType_targetId_key", unique: true }],
  });
  await prisma.$runCommandRaw({
    createIndexes: "Report",
    indexes: [{ key: { reporterId: 1, targetType: 1, targetId: 1 }, name: "Report_reporterId_targetType_targetId_key", unique: true }],
  });
}

export async function cleanup(userIds: string[], workspaceIds: string[]): Promise<void> {
  const sets = await prisma.studySet.findMany({ where: { OR: [{ ownerId: { in: userIds } }, { workspaceId: { in: workspaceIds } }] }, select: { id: true } });
  const setIds = sets.map((s) => s.id);
  const items = await prisma.studyItem.findMany({ where: { setId: { in: setIds } }, select: { id: true } });
  const targetIds = [...setIds, ...items.map((i) => i.id)];
  await prisma.outboxEvent.deleteMany({ where: { aggregateType: "Report" } });
  await prisma.report.deleteMany({ where: { targetId: { in: setIds } } });
  await prisma.assetLink.deleteMany({ where: { targetId: { in: targetIds } } });
  await prisma.asset.deleteMany({ where: { ownerId: { in: userIds } } });
  await prisma.studyItem.deleteMany({ where: { setId: { in: setIds } } });
  await prisma.studySet.deleteMany({ where: { id: { in: setIds } } });
  await prisma.workspaceMembership.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}
