import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { ContributionConfigValue } from "../../../core/constants/contribution";
import { avatarUrlOf } from "../../../shared/media";
import type { BoardRef, DirectoryUser, MembershipState, TaskRef } from "../entities/contribution.interface";
import type { IBoardContributionWriter, IContributionDirectory } from "./contribution-directory.repository.interface";
import type { TxHandle } from "./tx";

const toBoardRef = (b: { id: string; workspaceId: string; name: string; archivedAt: Date | null; createdAt: Date; version: number; contribution: Prisma.JsonValue | null }): BoardRef => ({
  id: b.id,
  workspaceId: b.workspaceId,
  name: b.name,
  archivedAt: b.archivedAt ?? null,
  createdAt: b.createdAt,
  version: b.version,
  contribution: b.contribution ?? null,
});

const BOARD_SELECT = { id: true, workspaceId: true, name: true, archivedAt: true, createdAt: true, version: true, contribution: true } as const;

export class PrismaContributionDirectory implements IContributionDirectory, IBoardContributionWriter {
  async getBoard(boardId: string): Promise<BoardRef | null> {
    const row = await prisma.board.findUnique({ where: { id: boardId }, select: BOARD_SELECT });
    return row ? toBoardRef(row) : null;
  }

  async getWorkspaceName(workspaceId: string): Promise<string | null> {
    const row = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } });
    return row?.name ?? null;
  }

  async getWorkspaceTimezone(workspaceId: string): Promise<string | null> {
    const row = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { timezone: true } });
    return row?.timezone ?? null;
  }

  async listMemberIds(workspaceId: string): Promise<string[]> {
    const rows = await prisma.workspaceMembership.findMany({
      where: { workspaceId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN", "MEMBER"] } },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  async getUsers(workspaceId: string, userIds: readonly string[]): Promise<Map<string, DirectoryUser>> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return new Map();
    const [users, memberships] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, status: true, avatarAssetId: true } }),
      prisma.workspaceMembership.findMany({ where: { workspaceId, userId: { in: ids } }, select: { userId: true, status: true, role: true } }),
    ]);
    const active = new Set(memberships.filter((m) => m.status === "ACTIVE" && m.role !== "GUEST").map((m) => m.userId));
    return new Map(
      users.map((u): [string, DirectoryUser] => {
        const membership: MembershipState = u.status === "ANONYMIZED" ? "ANONYMIZED" : active.has(u.id) ? "ACTIVE" : "LEFT";
        // Người đã rời vẫn hiện ảnh; ẩn danh hoá luôn `null` (kể cả khi dữ liệu cũ còn sót `avatarAssetId`).
        const avatarUrl = membership === "ANONYMIZED" ? null : avatarUrlOf(u.avatarAssetId);
        return [u.id, { id: u.id, name: u.name, avatarUrl, membership }];
      })
    );
  }

  async isKnownMember(workspaceId: string, userId: string): Promise<boolean> {
    const row = await prisma.workspaceMembership.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { role: true, status: true } });
    return row !== null && row.role !== "GUEST" && row.status !== "PENDING";
  }

  async getTasks(taskIds: readonly string[]): Promise<Map<string, TaskRef>> {
    const ids = [...new Set(taskIds)];
    if (ids.length === 0) return new Map();
    const rows = await prisma.task.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, deletedAt: true } });
    return new Map(rows.map((t): [string, TaskRef] => [t.id, { id: t.id, title: t.title, deleted: t.deletedAt !== null && t.deletedAt !== undefined }]));
  }

  async listBoards(workspaceId: string): Promise<BoardRef[]> {
    const rows = await prisma.board.findMany({ where: { workspaceId }, select: BOARD_SELECT, orderBy: { createdAt: "asc" } });
    return rows.map(toBoardRef);
  }

  async workspaceExists(workspaceId: string): Promise<boolean> {
    return (await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } })) !== null;
  }

  async setContribution(boardId: string, config: ContributionConfigValue, tx?: TxHandle): Promise<void> {
    await (tx ?? prisma).board.update({ where: { id: boardId }, data: { contribution: config as unknown as Prisma.InputJsonValue } });
  }
}
