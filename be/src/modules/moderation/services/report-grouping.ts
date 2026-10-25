import type { Report, ReportGroup, ReportReasonValue } from "../entities/report.interface";

/**
 * Gộp báo cáo theo `groupKey` (README p1-08 §5.3, §2 "gộp theo đích") — hàm thuần, KHÔNG chạm DB.
 * Làm trong bộ nhớ (repository chỉ `scan` ≤ `LIMITS.report.groupScanMax` báo cáo) thay vì `aggregateRaw`:
 * đúng nghĩa cho hàng đợi nhỏ/vừa và không dựa vào cú pháp aggregate Mongo chưa kiểm chứng ở đây.
 */
export function groupReports(reports: Report[]): ReportGroup[] {
  const byKey = new Map<string, Report[]>();
  for (const r of reports) {
    const list = byKey.get(r.groupKey);
    if (list) list.push(r);
    else byKey.set(r.groupKey, [r]);
  }
  return Array.from(byKey.values()).map(toGroup);
}

function toGroup(rows: Report[]): ReportGroup {
  const newest = rows.reduce((a, b) => (b.createdAt.getTime() > a.createdAt.getTime() ? b : a));
  const oldest = rows.reduce((a, b) => (b.createdAt.getTime() < a.createdAt.getTime() ? b : a));
  const open = rows.some((r) => r.status === "OPEN");
  const lastClosed = rows
    .filter((r) => r.status !== "OPEN" && r.resolvedAt !== null)
    .sort((a, b) => (b.resolvedAt?.getTime() ?? 0) - (a.resolvedAt?.getTime() ?? 0))[0];

  return {
    groupKey: newest.groupKey,
    targetType: newest.targetType,
    targetId: newest.targetId,
    reportCount: rows.length,
    reasons: reasonsByFrequency(rows),
    firstAt: oldest.createdAt,
    latestAt: newest.createdAt,
    status: open ? "OPEN" : (lastClosed?.status ?? newest.status),
    resolution: open ? null : (lastClosed?.resolution ?? null),
    scopeType: newest.scopeType,
    scopeId: newest.scopeId,
    scopeIsPrivate: newest.scopeIsPrivate,
    workspaceId: newest.workspaceId,
    targetAuthorId: newest.targetAuthorId,
    handlerLevel: newest.handlerLevel,
    representativeId: newest.id,
  };
}

/** Lý do khác nhau, phổ biến nhất trước; hoà thì theo thứ tự xuất hiện. */
export function reasonsByFrequency(rows: Report[]): ReportReasonValue[] {
  const counts = new Map<ReportReasonValue, number>();
  for (const r of rows) counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([reason]) => reason);
}

/** Thứ tự ổn định cho phân trang cursor: `latestAt` giảm dần rồi `groupKey` giảm dần. */
export function sortGroupsByLatest(groups: ReportGroup[]): ReportGroup[] {
  return [...groups].sort(
    (a, b) => b.latestAt.getTime() - a.latestAt.getTime() || (a.groupKey < b.groupKey ? 1 : a.groupKey > b.groupKey ? -1 : 0)
  );
}

/** Admin: `reportCount` giảm dần (hoà → mới nhất trước) hoặc `latest`. */
export function sortGroups(groups: ReportGroup[], sort: "reportCount" | "latest"): ReportGroup[] {
  if (sort === "latest") return sortGroupsByLatest(groups);
  return [...groups].sort(
    (a, b) => b.reportCount - a.reportCount || b.latestAt.getTime() - a.latestAt.getTime() || (a.groupKey < b.groupKey ? 1 : -1)
  );
}

/** Bỏ các nhóm đã nằm TRƯỚC/tại con trỏ `(at, groupKey)` (đã sắp bằng `sortGroupsByLatest`). */
export function afterGroupCursor(groups: ReportGroup[], cursor: { at: Date; id: string } | null): ReportGroup[] {
  if (!cursor) return groups;
  return groups.filter(
    (g) => g.latestAt.getTime() < cursor.at.getTime() || (g.latestAt.getTime() === cursor.at.getTime() && g.groupKey < cursor.id)
  );
}
