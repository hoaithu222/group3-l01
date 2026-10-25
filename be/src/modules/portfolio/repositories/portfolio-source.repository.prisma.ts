import { prisma } from "../../../infrastructure/database";
import type { MemberStats } from "../entities/portfolio.interface";
import type { EligibleWorkspace, IPortfolioSourceRepository, UserRef, WorkspaceRef } from "./portfolio-source.repository.interface";

/** Kho ĐỌC dữ liệu nguồn (chỉ `find`/`count` trên collection của `contribution`/`resources`/`workspaces`/`users`/`career`) — xem interface. */
export class PrismaPortfolioSourceRepository implements IPortfolioSourceRepository {
  async eligibleWorkspaces(userId: string): Promise<EligibleWorkspace[]> {
    const rows = await prisma.contributionSnapshot.findMany({ where: { userId, periodKey: "ALL", tasksDone: { gt: 0 } }, select: { workspaceId: true, tasksDone: true } });
    const byWorkspace = new Map<string, number>();
    for (const r of rows) byWorkspace.set(r.workspaceId, (byWorkspace.get(r.workspaceId) ?? 0) + r.tasksDone);
    return [...byWorkspace.entries()].map(([workspaceId, tasksDone]) => ({ workspaceId, tasksDone }));
  }

  async memberStats(userId: string, workspaceId: string): Promise<MemberStats | null> {
    const rows = await prisma.contributionSnapshot.findMany({ where: { userId, workspaceId, periodKey: "ALL", tasksDone: { gt: 0 } } });
    if (rows.length === 0) return null;
    const sum = (pick: (r: (typeof rows)[number]) => number): number => rows.reduce((acc, r) => acc + pick(r), 0);
    return {
      tasksDone: sum((r) => r.tasksDone),
      storyPointsX10: Math.round(sum((r) => r.storyPointsDone) * 10),
      tasksWithDue: sum((r) => r.tasksWithDue),
      tasksOnTime: sum((r) => r.tasksOnTime),
      // Chỉ tính lượt chấm của bảng CÓ điểm TB — để `peerScoreWeightedSum / reviewCount` là trung bình có trọng số đúng.
      reviewCount: sum((r) => (r.peerScoreAvg === null ? 0 : r.reviewCount)),
      peerScoreWeightedSum: sum((r) => (r.peerScoreAvg ?? 0) * r.reviewCount),
    };
  }

  async coAssignees(userId: string, workspaceId: string): Promise<string[]> {
    const facts = await prisma.contributionTaskFact.findMany({ where: { workspaceId, active: true, assigneeIds: { has: userId } }, select: { assigneeIds: true } });
    const out = new Set<string>();
    for (const f of facts) for (const id of f.assigneeIds) if (id !== userId) out.add(id);
    return [...out];
  }

  async filesUploaded(userId: string, workspaceId: string): Promise<number> {
    return prisma.resource.count({ where: { workspaceId, uploadedBy: userId } });
  }

  async workspaces(ids: readonly string[]): Promise<Map<string, WorkspaceRef>> {
    if (ids.length === 0) return new Map();
    const rows = await prisma.workspace.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true, status: true } });
    return new Map(rows.map((w) => [w.id, { id: w.id, name: w.name, archived: w.status === "ARCHIVED" }]));
  }

  async activeMemberOf(userId: string, workspaceIds: readonly string[]): Promise<Set<string>> {
    if (workspaceIds.length === 0) return new Set();
    const rows = await prisma.workspaceMembership.findMany({ where: { userId, status: "ACTIVE", role: { not: "GUEST" }, workspaceId: { in: [...workspaceIds] } }, select: { workspaceId: true } });
    return new Set(rows.map((r) => r.workspaceId));
  }

  async users(ids: readonly string[]): Promise<Map<string, UserRef>> {
    if (ids.length === 0) return new Map();
    const rows = await prisma.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true, status: true, avatarAssetId: true } });
    return new Map(rows.map((u) => [u.id, { id: u.id, name: u.name, status: u.status, avatarAssetId: u.avatarAssetId ?? null }]));
  }

  async teammateConsent(userIds: readonly string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const rows = await prisma.userCareer.findMany({ where: { userId: { in: [...userIds] } }, select: { userId: true, visibility: true } });
    return new Set(rows.filter((r) => r.visibility.appearInOthersPortfolios === true).map((r) => r.userId));
  }
}
