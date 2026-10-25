import { prisma } from "../../../infrastructure/database";
import type { ChannelBrief, IMentorDirectory, UserBrief, WorkspaceBrief } from "./mentor-directory.interface";

/** Đọc thông tin hiển thị từ collection module khác — CHỈ ĐỌC (mẫu `wallet-directory.repository.prisma.ts`). */
export class PrismaMentorDirectory implements IMentorDirectory {
  async workspaces(ids: string[]): Promise<Map<string, WorkspaceBrief>> {
    if (ids.length === 0) return new Map();
    const rows = await prisma.workspace.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, name: true, status: true, defaultChannelId: true, avatarAssetId: true },
    });
    return new Map(
      rows.map((r) => [r.id, { id: r.id, name: r.name, status: r.status, defaultChannelId: r.defaultChannelId ?? null, avatarAssetId: r.avatarAssetId ?? null }])
    );
  }

  async users(ids: string[]): Promise<Map<string, UserBrief>> {
    if (ids.length === 0) return new Map();
    const rows = await prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, name: true, avatarAssetId: true } });
    return new Map(rows.map((r) => [r.id, { id: r.id, name: r.name, avatarAssetId: r.avatarAssetId ?? null }]));
  }

  async channels(workspaceId: string, ids: string[]): Promise<ChannelBrief[]> {
    if (ids.length === 0) return [];
    const rows = await prisma.channel.findMany({
      where: { workspaceId, id: { in: [...new Set(ids)] } },
      select: { id: true, workspaceId: true, name: true, status: true, visibility: true },
    });
    return rows.map((r) => ({ id: r.id, workspaceId: r.workspaceId, name: r.name, status: r.status, visibility: r.visibility }));
  }

  async adminIds(workspaceId: string): Promise<string[]> {
    const rows = await prisma.workspaceMembership.findMany({
      where: { workspaceId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN"] } },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }
}
