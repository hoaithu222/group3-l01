import { prisma } from "../../../infrastructure/database";
import { normalizeEmail } from "../../../core/auth/normalize-email";

export interface DirectoryUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

/** Bản chụp tài liệu Resource Hub (p3-01) để đặt in — chỉ các trường cần cho snapshot. */
export interface ResourceSnapshot {
  id: string;
  workspaceId: string;
  assetId: string;
  name: string;
  mime: string;
  deleted: boolean;
}

/**
 * Tra cứu CHỈ ĐỌC dữ liệu của module khác (User, Resource) — mẫu "truy vấn chỉ-đọc" như `contribution` (không import module,
 * không ghi). Quyền đọc Resource KHÔNG kiểm ở đây: service gọi `permissionService` (`workspace.resource.read`) trước khi dùng.
 */
export interface IO2oDirectory {
  findUserByEmail(email: string): Promise<DirectoryUser | null>;
  findUser(id: string): Promise<DirectoryUser | null>;
  usersByIds(ids: string[]): Promise<Map<string, DirectoryUser>>;
  findResource(resourceId: string): Promise<ResourceSnapshot | null>;
}

const USER_SELECT = { id: true, name: true, email: true, role: true, status: true } as const;

export class PrismaO2oDirectory implements IO2oDirectory {
  async findUserByEmail(email: string): Promise<DirectoryUser | null> {
    return prisma.user.findUnique({ where: { email: normalizeEmail(email) }, select: USER_SELECT });
  }

  async findUser(id: string): Promise<DirectoryUser | null> {
    return prisma.user.findUnique({ where: { id }, select: USER_SELECT });
  }

  async usersByIds(ids: string[]): Promise<Map<string, DirectoryUser>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await prisma.user.findMany({ where: { id: { in: unique } }, select: USER_SELECT });
    return new Map(rows.map((u) => [u.id, u]));
  }

  async findResource(resourceId: string): Promise<ResourceSnapshot | null> {
    const r = await prisma.resource.findUnique({
      where: { id: resourceId },
      select: { id: true, workspaceId: true, assetId: true, name: true, mime: true, deletedAt: true },
    });
    return r ? { id: r.id, workspaceId: r.workspaceId, assetId: r.assetId, name: r.name, mime: r.mime, deleted: r.deletedAt !== null } : null;
  }
}
