/**
 * Nguồn dữ liệu chung của career/portfolio/recruiter: các thẻ ĐÃ HOÀN THÀNH do seed tạo (clientTaskId `seed-rich:*`), cùng số liệu đóng góp
 * theo (người, nhóm) tính đúng cách phân hệ `contribution` tính (story points chia đều cho người làm, đúng hạn = hoàn thành ≤ hạn).
 * Nếu `ContributionSnapshot` (kỳ `ALL`) đã có cho (người, nhóm) thì ưu tiên dùng — để khớp chính xác nguồn mà cổng đọc của app đọc.
 */
import { prisma } from "../core";
import type { ModuleCtx } from "../module-ctx";

export interface DoneTask {
  id: string;
  workspaceId: string;
  boardId: string;
  title: string;
  assigneeIds: string[];
  storyPoints: number;
  completedAt: Date;
  dueDate: Date | null;
  completionCount: number;
  labelNames: string[];
}

export async function loadSeedDoneTasks(c: ModuleCtx): Promise<DoneTask[]> {
  const wsIds = [...c.workspaces.values()].map((w) => w.id);
  if (wsIds.length === 0) return [];
  const tasks = await prisma.task.findMany({
    where: { columnKind: "DONE", deletedAt: null, workspaceId: { in: wsIds }, clientTaskId: { startsWith: "seed-rich:" } },
    orderBy: [{ completedAt: "asc" }, { id: "asc" }],
  });
  const labelIds = [...new Set(tasks.flatMap((t) => t.labelIds))];
  const labels = labelIds.length === 0 ? [] : await prisma.label.findMany({ where: { id: { in: labelIds } }, select: { id: true, name: true } });
  const nameOf = new Map(labels.map((l) => [l.id, l.name]));
  return tasks.flatMap((t) => {
    // Thẻ có mốc hoàn thành ở tương lai (so với lúc seed) chưa thật sự "đã xong" — không tính vào đóng góp/tiến độ.
    if (t.storyPoints === null || t.assigneeIds.length === 0 || !t.completedAt || t.completedAt > c.now) return [];
    return [
      {
        id: t.id,
        workspaceId: t.workspaceId,
        boardId: t.boardId,
        title: t.title,
        assigneeIds: t.assigneeIds,
        storyPoints: t.storyPoints,
        completedAt: t.completedAt,
        dueDate: t.dueDate ?? null,
        completionCount: t.completionCount,
        labelNames: t.labelIds.flatMap((id) => nameOf.get(id) ?? []),
      },
    ];
  });
}

export interface MemberStats {
  tasksDone: number;
  storyPointsX10: number;
  tasksWithDue: number;
  tasksOnTime: number;
  /** Id đồng đội cùng làm ≥ 1 thẻ đã hoàn thành với người này trong nhóm. */
  coAssigneeIds: string[];
  /** Thời điểm thẻ đầu/cuối được hoàn thành (để đặt khoảng thời gian dự án). */
  firstDoneAt: Date;
  lastDoneAt: Date;
  /** Điểm đóng góp ×10 trung bình các bảng (`ContributionSnapshot` kỳ ALL) — `null` khi chưa có snapshot. */
  scoreX10: number | null;
  shareX10: number | null;
}

/** Số liệu của MỘT người trong MỘT nhóm; `null` nếu người này chưa có thẻ hoàn thành nào ở nhóm (không đủ điều kiện thêm dự án). */
export function memberStats(tasks: readonly DoneTask[], userId: string, workspaceId: string, snapshots: ReadonlyMap<string, SnapshotAgg>): MemberStats | null {
  const mine = tasks.filter((t) => t.workspaceId === workspaceId && t.assigneeIds.includes(userId));
  if (mine.length === 0) return null;
  let points = 0;
  let withDue = 0;
  let onTime = 0;
  const co = new Set<string>();
  for (const t of mine) {
    points += t.storyPoints / t.assigneeIds.length;
    if (t.dueDate) {
      withDue += 1;
      if (t.completedAt <= t.dueDate) onTime += 1;
    }
    for (const id of t.assigneeIds) if (id !== userId) co.add(id);
  }
  const snap = snapshots.get(`${userId}:${workspaceId}`);
  const times = mine.map((t) => t.completedAt.getTime());
  return {
    tasksDone: mine.length,
    storyPointsX10: Math.round(points * 10),
    tasksWithDue: withDue,
    tasksOnTime: onTime,
    coAssigneeIds: [...co],
    firstDoneAt: new Date(Math.min(...times)),
    lastDoneAt: new Date(Math.max(...times)),
    scoreX10: snap ? snap.scoreX10 : null,
    shareX10: snap ? snap.shareX10 : null,
  };
}

export interface SnapshotAgg {
  scoreX10: number;
  shareX10: number;
  boards: number;
}

const mean = (v: readonly number[]): number => v.reduce((a, b) => a + b, 0) / v.length;

/**
 * Gom `ContributionSnapshot` kỳ `ALL` theo (người, nhóm) đúng công thức `ContributionReadService.memberScore`: chỉ bảng có `tasksDone > 0`,
 * điểm = trung bình điểm các bảng. Khoá `"<userId>:<workspaceId>"`.
 */
export async function loadContributionAggregates(userIds: readonly string[]): Promise<Map<string, SnapshotAgg>> {
  const out = new Map<string, SnapshotAgg>();
  if (userIds.length === 0) return out;
  const rows = await prisma.contributionSnapshot.findMany({ where: { userId: { in: [...userIds] }, periodKey: "ALL", tasksDone: { gt: 0 } } });
  const grouped = new Map<string, typeof rows>();
  for (const r of rows) grouped.set(`${r.userId}:${r.workspaceId}`, [...(grouped.get(`${r.userId}:${r.workspaceId}`) ?? []), r]);
  for (const [key, list] of grouped) {
    out.set(key, { scoreX10: Math.round(mean(list.map((r) => r.score)) * 10), shareX10: Math.round(mean(list.map((r) => r.share)) * 10), boards: list.length });
  }
  return out;
}

/** Điểm đóng góp toàn hồ sơ như `ContributionReadService.careerScore`: trung bình điểm các nhóm có dữ liệu. `null` khi chưa nhóm nào. */
export function careerScore(userId: string, snapshots: ReadonlyMap<string, SnapshotAgg>): { pctX10: number; workspaces: number } | null {
  const scores = [...snapshots.entries()].filter(([k]) => k.startsWith(`${userId}:`)).map(([, v]) => v.scoreX10);
  if (scores.length === 0) return null;
  return { pctX10: Math.round(mean(scores)), workspaces: scores.length };
}
