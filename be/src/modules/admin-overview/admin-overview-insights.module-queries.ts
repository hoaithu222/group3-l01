import { prisma } from "../../infrastructure/database";
import type { InsightsBreakdownItem, InsightsTopWorkspace } from "./admin-overview-insights.types";
import { docsOf, ejsonDate, facetOf, num, rangeOf, toDayMap, utcDayKey } from "./admin-overview-insights.raw";
import { toBreakdown, type InsightsWindow } from "./admin-overview-insights.window";

/**
 * Truy vấn thô cho các phân hệ có cờ: gọi/họp (`voice`/`meeting`), gamification, báo cáo + workspace (`communication`). Cùng cách làm với
 * `admin-overview-insights.queries.ts` — quét MỘT lần `[previousStart, end)` rồi tách hai kỳ ở Node. Caller (service) chịu trách nhiệm kiểm cờ và bắt lỗi từng khối.
 */

export interface CallAgg {
  /** Cuộc gọi BẮT ĐẦU mỗi ngày (cả hai kỳ, mọi trạng thái). */
  byDay: Map<string, number>;
  /** `mediaKind` của cuộc gọi bắt đầu trong kỳ HIỆN TẠI. */
  media: InsightsBreakdownItem[];
  /** TỔNG GIÂY của cuộc gọi ĐÃ KẾT THÚC mỗi ngày (theo `endedAt`, cả hai kỳ) — service đổi sang phút. */
  secondsByDay: Map<string, number>;
}

/**
 * Số cuộc gọi tính theo `startedAt`, phút tính theo `endedAt` của cuộc gọi `ENDED` (đúng nghĩa "đã kết thúc trong kỳ"). Hai lượt quét song song vì
 * hai trường thời gian khác nhau. `Call` chỉ có chỉ mục `[status, startedAt]`/`[workspaceId, startedAt]`/`[scopeType, scopeId, startedAt]` — không có `startedAt`
 * hay `endedAt` đứng đầu nên cả hai là quét bảng (bảng nhỏ hơn `Message` nhiều).
 */
export async function callAgg(w: InsightsWindow): Promise<CallAgg> {
  const [started, ended] = await Promise.all([
    prisma.call.aggregateRaw({
      pipeline: [
        { $match: { startedAt: rangeOf(w.previousStart, w.end) } },
        { $group: { _id: { d: utcDayKey("$startedAt"), m: "$mediaKind" }, n: { $sum: 1 } } },
      ],
    }),
    prisma.call.aggregateRaw({
      pipeline: [
        { $match: { status: "ENDED", endedAt: rangeOf(w.previousStart, w.end) } },
        { $group: { _id: utcDayKey("$endedAt"), sec: { $sum: { $ifNull: ["$durationSec", 0] } } } },
      ],
    }),
  ]);

  const byDay = new Map<string, number>();
  const media = new Map<string, number>();
  for (const r of docsOf(started)) {
    const id = r._id as { d: string; m: string };
    const n = num(r.n);
    byDay.set(id.d, (byDay.get(id.d) ?? 0) + n);
    if (id.d >= w.currentDates[0]) media.set(id.m, (media.get(id.m) ?? 0) + n); // `YYYY-MM-DD` so sánh chuỗi = so sánh ngày.
  }
  return { byDay, media: toBreakdown([...media.entries()]), secondsByDay: toDayMap(docsOf(ended), "sec") };
}

export interface XpAgg {
  byDay: Map<string, number>;
  /** `count` = tổng XP; giảm dần, tối đa 8 dòng; chỉ kỳ hiện tại. */
  bySource: InsightsBreakdownItem[];
}

/**
 * XP đã CẤP: `xp > 0`, không `capped`, không `blockedReason` (dòng bị chặn vẫn được ghi để tăng counter/streak nhưng không phải XP thật). Tính theo `occurredAt`.
 * `XpEvent` chưa có chỉ mục `occurredAt` thuần (chỉ `[userId, createdAt]`, `[workspaceId, occurredAt]`) nên là quét bảng.
 */
export async function xpAgg(w: InsightsWindow): Promise<XpAgg> {
  const raw = await prisma.xpEvent.aggregateRaw({
    pipeline: [
      { $match: { occurredAt: rangeOf(w.previousStart, w.end), xp: { $gt: 0 }, capped: { $ne: true }, blockedReason: null } },
      {
        $facet: {
          byDay: [{ $group: { _id: utcDayKey("$occurredAt"), n: { $sum: "$xp" } } }],
          bySource: [
            { $match: { occurredAt: { $gte: ejsonDate(w.currentStart) } } },
            { $group: { _id: "$sourceType", n: { $sum: "$xp" } } },
            { $sort: { n: -1, _id: 1 } },
            { $limit: 8 },
          ],
        },
      },
    ],
    options: { allowDiskUse: true },
  });
  return { byDay: toDayMap(facetOf(raw, "byDay")), bySource: toBreakdown(facetOf(raw, "bySource").map((r) => [String(r._id), num(r.n)]), 8) };
}

/** Huy hiệu mở khoá theo ngày (`unlockedAt`), bỏ huy hiệu đã thu hồi (`revokedAt`). `UserBadge` không có chỉ mục theo thời điểm — bảng nhỏ. */
export async function badgesUnlockedByDay(w: InsightsWindow): Promise<Map<string, number>> {
  const raw = await prisma.userBadge.aggregateRaw({
    pipeline: [{ $match: { unlockedAt: rangeOf(w.previousStart, w.end), revokedAt: null } }, { $group: { _id: utcDayKey("$unlockedAt"), n: { $sum: 1 } } }],
  });
  return toDayMap(docsOf(raw));
}

/** Phân bố cấp độ: nếu có > 10 cấp có người thì giữ 10 cấp ĐÔNG nhất, rồi xếp theo cấp tăng dần để vẽ cột. */
export async function levelDistribution(): Promise<InsightsBreakdownItem[]> {
  const groups = await prisma.userGamification.groupBy({ by: ["level"], _count: { _all: true } });
  return toBreakdown(groups.map((g) => [String(g.level), g._count._all]), 10).sort((a, b) => Number(a.key) - Number(b.key));
}

/** Báo cáo kiểm duyệt TẠO trong kỳ hiện tại theo trạng thái (index `[status, createdAt]` không phủ lọc thuần theo `createdAt` — bảng nhỏ). */
export async function reportStatusCounts(w: InsightsWindow): Promise<InsightsBreakdownItem[]> {
  const groups = await prisma.report.groupBy({ by: ["status"], where: { createdAt: { gte: w.currentStart, lt: w.end } }, _count: { _all: true } });
  return toBreakdown(groups.map((g) => [g.status, g._count._all]));
}

/** Gắn tên + số thành viên cho top workspace (giữ nguyên thứ tự đã sắp theo tin nhắn). Workspace đã bị xoá khỏi DB thì bỏ dòng. Không lộ gì ngoài id/tên/memberCount/messages. */
export async function nameTopWorkspaces(top: Array<{ id: string; messages: number }>): Promise<InsightsTopWorkspace[]> {
  if (top.length === 0) return [];
  const rows = await prisma.workspace.findMany({ where: { id: { in: top.map((t) => t.id) } }, select: { id: true, name: true, memberCount: true } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return top.flatMap((t) => {
    const ws = byId.get(t.id);
    return ws ? [{ id: ws.id, name: ws.name, memberCount: ws.memberCount, messages: t.messages }] : [];
  });
}
