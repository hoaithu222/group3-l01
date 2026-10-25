import { prisma } from "../../../infrastructure/database";
import { permissionService } from "../../../core/permission";
import type { AuthUser } from "../../../core/types/express";

export interface QuizUserRef {
  id: string;
  name: string;
  avatarAssetId: string | null;
}

/** Tra cứu người dùng cho tên hiển thị/ảnh đại diện của người chơi (batch, chỉ id + tên + ảnh — không email/điện thoại). */
export interface IQuizUserDirectory {
  findMany(ids: string[]): Promise<Map<string, QuizUserRef>>;
}

export class PrismaQuizUserDirectory implements IQuizUserDirectory {
  async findMany(ids: string[]): Promise<Map<string, QuizUserRef>> {
    const unique = Array.from(new Set(ids));
    if (unique.length === 0) return new Map();
    const rows = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, avatarAssetId: true } });
    return new Map(rows.map((u) => [u.id, { id: u.id, name: u.name, avatarAssetId: u.avatarAssetId }]));
  }
}

export type QuizWorkspaceRole = "OWNER" | "ADMIN" | "MEMBER";

/** Vai trò trong workspace của phiên (`workspaceId`) — GUEST/người ngoài → `null` (README §6: phiên workspace chỉ dành cho thành viên). */
export interface IQuizWorkspaceAccess {
  roleOf(user: AuthUser, workspaceId: string): Promise<QuizWorkspaceRole | null>;
}

export class PermissionQuizWorkspaceAccess implements IQuizWorkspaceAccess {
  async roleOf(user: AuthUser, workspaceId: string): Promise<QuizWorkspaceRole | null> {
    const access = await permissionService.resolve(user, { type: "WORKSPACE", id: workspaceId });
    if (!access.visible) return null;
    return access.role === "OWNER" || access.role === "ADMIN" || access.role === "MEMBER" ? access.role : null;
  }
}
