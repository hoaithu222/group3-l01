import { prisma } from "../../infrastructure/database";
import type { InsightsBreakdownItem } from "./admin-overview-insights.types";
import { docsOf, ejsonDate, facetOf, idOf, num, rangeOf, toDayMap, utcDayKey, type Stage } from "./admin-overview-insights.raw";
import { toBreakdown, type InsightsWindow } from "./admin-overview-insights.window";

/**
 * Truy vấn thô cho phần LÕI (người dùng, phiên) và phần `communication` (tin nhắn) của insights. Mọi truy vấn theo ngày đi qua `aggregateRaw`
 * (Prisma + MongoDB không có `groupBy` theo ngày) và quét MỘT lần cả hai kỳ `[previousStart, end)`; `$facet` gộp nhiều cách nhóm vào cùng lượt quét.
 */

/** Múi giờ chia thứ × giờ của bản đồ nhiệt — cố định, cùng `callsToday` của `media`. */
export const HEATMAP_TZ = "Asia/Ho_Chi_Minh";

/** Số bản ghi `User` theo ngày đăng ký (cả hai kỳ). `User` không có chỉ mục `createdAt` — bảng người dùng nhỏ nên chấp nhận quét. */
export async function usersCreatedByDay(w: InsightsWindow): Promise<Map<string, number>> {
  const raw = await prisma.user.aggregateRaw({
    pipeline: [{ $match: { createdAt: rangeOf(w.previousStart, w.end) } }, { $group: { _id: utcDayKey("$createdAt"), n: { $sum: 1 } } }],
  });
  return toDayMap(docsOf(raw));
}

/**
 * Mốc tạo `User` CŨ NHẤT = "hệ thống bắt đầu chạy từ khi nào". Dùng để biết kỳ trước có nằm trọn trong thời gian hệ thống hoạt động không (nếu không thì
 * `previous = null` thay vì một số 0 gây hiểu nhầm). Mốc này chỉ có thể lùi về quá khứ khi nạp thêm dữ liệu cũ nên cache suốt đời tiến trình sau khi đã tìm thấy.
 */
let systemStartAt: Date | null = null;
export async function getSystemStartAt(): Promise<Date | null> {
  if (systemStartAt) return systemStartAt;
  const oldest = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } });
  systemStartAt = oldest?.createdAt ?? null;
  return systemStartAt;
}

/** Ảnh chụp tình trạng + vai trò tài khoản; `totalUsers` đã trừ tài khoản `ANONYMIZED`. Dùng `groupBy` thường (không nhóm theo ngày) nên không cần raw. */
export async function userSnapshots(): Promise<{ totalUsers: number; status: InsightsBreakdownItem[]; role: InsightsBreakdownItem[] }> {
  const [byStatus, byRole] = await Promise.all([
    prisma.user.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
  ]);
  return {
    totalUsers: byStatus.filter((g) => g.status !== "ANONYMIZED").reduce((sum, g) => sum + g._count._all, 0),
    status: toBreakdown(byStatus.map((g) => [g.status, g._count._all])),
    role: toBreakdown(byRole.map((g) => [g.role, g._count._all])),
  };
}

export interface ActiveUsersAgg {
  /** Số user DUY NHẤT mỗi ngày (cả hai kỳ). */
  byDay: Map<string, number>;
  /** Số user DUY NHẤT trong cả kỳ (KHÔNG phải tổng các ngày — một người hoạt động nhiều ngày chỉ tính một). */
  current: number;
  previous: number;
}

/**
 * Người dùng hoạt động từ `Session.lastUsedAt` (cùng nguồn `buildActiveUsersSeries` của `GET /admin/overview`). Hai bước `$group` để đếm DUY NHẤT
 * ngay trong Mongo (chỉ trả ≤ 2·days dòng, không kéo cả phiên về Node). Lưu ý nguồn: `lastUsedAt` chỉ giữ LẦN DÙNG CUỐI của mỗi phiên nên
 * kỳ trước bị đếm hụt nhẹ (phiên đã dùng tiếp ở kỳ này thì không còn nằm ở kỳ trước) — đo mức xu hướng, không phải số tuyệt đối.
 */
export async function activeUsersAgg(w: InsightsWindow): Promise<ActiveUsersAgg> {
  const inCurrent = { $gte: ["$lastUsedAt", ejsonDate(w.currentStart)] };
  const raw = await prisma.session.aggregateRaw({
    pipeline: [
      { $match: { lastUsedAt: rangeOf(w.previousStart, w.end) } },
      {
        $facet: {
          byDay: [{ $group: { _id: { d: utcDayKey("$lastUsedAt"), u: "$userId" } } }, { $group: { _id: "$_id.d", n: { $sum: 1 } } }],
          byUser: [
            { $group: { _id: "$userId", cur: { $max: { $cond: [inCurrent, 1, 0] } }, prev: { $max: { $cond: [inCurrent, 0, 1] } } } },
            { $group: { _id: null, current: { $sum: "$cur" }, previous: { $sum: "$prev" } } },
          ],
        },
      },
    ],
    options: { allowDiskUse: true },
  });
  const totals = facetOf(raw, "byUser")[0];
  return { byDay: toDayMap(facetOf(raw, "byDay")), current: num(totals?.current), previous: num(totals?.previous) };
}

export interface MessageAgg {
  /** Tin nhắn theo ngày UTC (cả hai kỳ). */
  byDay: Map<string, number>;
  /** 7 × 24 — Thứ Hai = 0, giờ theo `HEATMAP_TZ`; CHỈ kỳ hiện tại. */
  cells: number[][];
  scope: InsightsBreakdownItem[];
  /** Tối đa 5 workspace, giảm dần (chỉ id + số tin; tên/memberCount tra ở bước sau). */
  topWorkspaces: Array<{ id: string; messages: number }>;
}

/**
 * Tin nhắn người dùng gửi: `kind = USER` (cùng cách đếm của `workspace.stats-daily`; loại tin hệ thống/khảo sát) và `deletedAt = null` (tin đã thu hồi/xoá không tính).
 * `Message` là bảng LỚN NHẤT nên cả bốn cách nhóm (theo ngày, bản đồ nhiệt, phạm vi, top workspace) dồn vào MỘT `$facet` = một lượt quét. Hiện `Message` chưa
 * có chỉ mục theo `createdAt` thuần (chỉ `[workspaceId, createdAt]` — không phủ tin hội thoại không thuộc workspace) nên lượt quét này là quét bảng; đã có cache 60 s ở service.
 */
export async function messageAgg(w: InsightsWindow): Promise<MessageAgg> {
  const inCurrent: Stage = { $match: { createdAt: { $gte: ejsonDate(w.currentStart) } } };
  const local = (op: "$isoDayOfWeek" | "$hour"): Stage => ({ [op]: { date: "$createdAt", timezone: HEATMAP_TZ } });
  const raw = await prisma.message.aggregateRaw({
    pipeline: [
      { $match: { createdAt: rangeOf(w.previousStart, w.end), kind: "USER", deletedAt: null } },
      {
        $facet: {
          byDay: [{ $group: { _id: utcDayKey("$createdAt"), n: { $sum: 1 } } }],
          heat: [inCurrent, { $group: { _id: { d: local("$isoDayOfWeek"), h: local("$hour") }, n: { $sum: 1 } } }],
          scope: [inCurrent, { $group: { _id: "$scopeType", n: { $sum: 1 } } }],
          workspaces: [inCurrent, { $match: { workspaceId: { $ne: null } } }, { $group: { _id: "$workspaceId", n: { $sum: 1 } } }, { $sort: { n: -1, _id: 1 } }, { $limit: 5 }],
        },
      },
    ],
    options: { allowDiskUse: true },
  });

  const cells = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const r of facetOf(raw, "heat")) {
    const id = r._id as { d?: unknown; h?: unknown };
    const day = num(id.d) - 1; // `$isoDayOfWeek`: 1 = Thứ Hai … 7 = Chủ nhật → 0…6.
    const hour = num(id.h);
    if (day >= 0 && day < 7 && hour >= 0 && hour < 24) cells[day][hour] = num(r.n);
  }
  return {
    byDay: toDayMap(facetOf(raw, "byDay")),
    cells,
    scope: toBreakdown(facetOf(raw, "scope").map((r) => [String(r._id), num(r.n)])),
    topWorkspaces: facetOf(raw, "workspaces").map((r) => ({ id: idOf(r._id), messages: num(r.n) })),
  };
}
