import type { Prisma } from "@prisma/client";
import { permissionService } from "../../../core/permission";
import type { AuthUser } from "../../../core/types/express";
import { prisma } from "../../../infrastructure/database";
import type { PomodoroConfig } from "../entities/pomodoro.interface";
import { normalizePomodoroConfig } from "../services/pomodoro-config";
import type { IPomodoroAccess, IPomodoroChannelReader, PomodoroChannelInfo } from "../services/pomodoro.ports";

/**
 * Đọc CHỈ-ĐỌC dữ kiện kênh/người dùng của module khác cho `pomodoro` (cùng cách `calls/repositories/call-scope.reader.ts`): quyền vẫn đi qua
 * `PermissionService`, reader chỉ cấp dữ kiện. Ghi duy nhất khoá `settings.pomodoro` của `Channel` (Json do p1-03 dành riêng cho p5-02) —
 * không đụng trường nào khác của kênh.
 */
export class PrismaPomodoroChannelReader implements IPomodoroChannelReader {
  async get(channelId: string): Promise<PomodoroChannelInfo | null> {
    const row = await prisma.channel.findUnique({
      where: { id: channelId },
      select: { id: true, workspaceId: true, name: true, type: true, status: true, settings: true },
    });
    if (!row) return null;
    const workspace = await prisma.workspace.findUnique({ where: { id: row.workspaceId }, select: { status: true } });
    const settings = row.settings as { pomodoro?: unknown } | null;
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      name: row.name,
      type: row.type,
      status: row.status,
      workspaceActive: workspace?.status === "ACTIVE",
      defaultConfig: normalizePomodoroConfig(settings?.pomodoro),
    };
  }

  async names(channelIds: string[]): Promise<Map<string, string>> {
    const ids = [...new Set(channelIds)];
    if (ids.length === 0) return new Map();
    const rows = await prisma.channel.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  async userNames(userIds: string[]): Promise<Map<string, string>> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return new Map();
    const rows = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  async saveDefaultConfig(channelId: string, config: PomodoroConfig): Promise<void> {
    const row = await prisma.channel.findUnique({ where: { id: channelId }, select: { settings: true } });
    const current = row?.settings && typeof row.settings === "object" && !Array.isArray(row.settings) ? (row.settings as Record<string, unknown>) : {};
    await prisma.channel.updateMany({
      where: { id: channelId },
      data: { settings: { ...current, pomodoro: config } as unknown as Prisma.InputJsonValue },
    });
  }
}

export class PermissionPomodoroAccess implements IPomodoroAccess {
  canManage(user: AuthUser, channelId: string): Promise<boolean> {
    return permissionService.can(user, "channel.manage", { type: "CHANNEL", id: channelId });
  }

  canRead(user: AuthUser, channelId: string): Promise<boolean> {
    return permissionService.can(user, "channel.read", { type: "CHANNEL", id: channelId });
  }
}
