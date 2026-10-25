import { escapeRegex } from "../../../core/utils/escape-regex";
import { normalizeSearch, normalizeSkillLabel } from "../../../core/utils/normalize";
import { prisma } from "../../../infrastructure/database";

/**
 * Cổng ĐỌC dữ liệu nguồn của module khác (thẻ, lượt chấm, nhóm, thành viên, nhãn) — thay cho `TaskReadPort` của kế hoạch: `career` chỉ đọc,
 * không ghi collection của `projects`/`workspaces` (mẫu `contribution-source.repository`). KHÔNG trả nội dung ngoài tiêu đề thẻ, và tiêu đề
 * chỉ tới tay người xem đã qua `SkillVisibilityService`.
 */
export interface TaskStateRef {
  columnKind: string;
  completionCount: number;
  deletedAt: Date | null;
}

export interface TaskTitleRef {
  id: string;
  title: string;
  workspaceId: string;
}

export interface UserRef {
  id: string;
  name: string;
  status: string;
}

export interface LabelSuggestion {
  name: string;
  normalized: string;
  count: number;
}

export interface ISkillSourceRepository {
  taskState(taskId: string): Promise<TaskStateRef | null>;
  /** Điểm TB ×10 các lượt DUYỆT có điểm của MỘT lượt chấm; không có → `null`. */
  roundReviewAvgX10(roundId: string): Promise<number | null>;
  tasks(taskIds: readonly string[]): Promise<Map<string, TaskTitleRef>>;
  workspaceNames(ids: readonly string[]): Promise<Map<string, string>>;
  /** Nhóm người dùng là thành viên ACTIVE (không tính khách GUEST) và nhóm còn ACTIVE — giới hạn trong `among` nếu có. */
  memberWorkspaceIds(userId: string, among?: readonly string[]): Promise<Set<string>>;
  users(ids: readonly string[]): Promise<Map<string, UserRef>>;
  labelSuggestions(q: string, limit: number): Promise<LabelSuggestion[]>;
}

export class PrismaSkillSourceRepository implements ISkillSourceRepository {
  async taskState(taskId: string): Promise<TaskStateRef | null> {
    const t = await prisma.task.findUnique({ where: { id: taskId }, select: { columnKind: true, completionCount: true, deletedAt: true } });
    return t ? { columnKind: t.columnKind, completionCount: t.completionCount, deletedAt: t.deletedAt ?? null } : null;
  }

  async roundReviewAvgX10(roundId: string): Promise<number | null> {
    const rows = await prisma.taskReview.findMany({ where: { roundId, status: "APPROVED", score10: { not: null } }, select: { score10: true } });
    const scores = rows.map((r) => r.score10).filter((s): s is number => typeof s === "number");
    return scores.length === 0 ? null : Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10);
  }

  async tasks(taskIds: readonly string[]): Promise<Map<string, TaskTitleRef>> {
    if (taskIds.length === 0) return new Map();
    const rows = await prisma.task.findMany({ where: { id: { in: [...taskIds] } }, select: { id: true, title: true, workspaceId: true } });
    return new Map(rows.map((r) => [r.id, r]));
  }

  async workspaceNames(ids: readonly string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await prisma.workspace.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true } });
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  async memberWorkspaceIds(userId: string, among?: readonly string[]): Promise<Set<string>> {
    if (among && among.length === 0) return new Set();
    const rows = await prisma.workspaceMembership.findMany({
      where: { userId, status: "ACTIVE", role: { not: "GUEST" }, ...(among && { workspaceId: { in: [...among] } }) },
      select: { workspaceId: true },
    });
    const ids = [...new Set(rows.map((r) => r.workspaceId))];
    if (ids.length === 0) return new Set();
    const active = await prisma.workspace.findMany({ where: { id: { in: ids }, status: "ACTIVE" }, select: { id: true } });
    return new Set(active.map((w) => w.id));
  }

  async users(ids: readonly string[]): Promise<Map<string, UserRef>> {
    if (ids.length === 0) return new Map();
    const rows = await prisma.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true, status: true } });
    return new Map(rows.map((r) => [r.id, r]));
  }

  /** Nhãn phổ biến (tên + số lần dùng, KHÔNG id bảng/nhóm) gộp theo dạng chuẩn hoá kỹ năng — gợi ý `labelMatch` cho admin. */
  async labelSuggestions(q: string, limit: number): Promise<LabelSuggestion[]> {
    const needle = normalizeSearch(q);
    const rows = await prisma.label.groupBy({
      by: ["normalizedName"],
      where: needle ? { normalizedName: { contains: escapeRegex(needle) } } : {},
      _count: { _all: true },
      _min: { name: true },
      orderBy: { _count: { normalizedName: "desc" } },
      take: limit * 5,
    });
    const merged = new Map<string, LabelSuggestion>();
    for (const r of rows) {
      const normalized = normalizeSkillLabel(r._min.name ?? r.normalizedName);
      if (!normalized) continue;
      const cur = merged.get(normalized);
      if (cur) cur.count += r._count._all;
      else merged.set(normalized, { name: r._min.name ?? r.normalizedName, normalized, count: r._count._all });
    }
    return [...merged.values()].sort((a, b) => b.count - a.count || a.normalized.localeCompare(b.normalized)).slice(0, limit);
  }
}
