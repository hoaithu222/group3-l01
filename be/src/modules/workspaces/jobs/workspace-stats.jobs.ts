import { prisma } from "../../../infrastructure/database";
import { logger } from "../../../infrastructure/logger";
import { registerJob, defineCron } from "../../../infrastructure/queue";
import { env } from "../../../core/config";
import { dayRangeUtc, isDayKey, previousDayKey } from "../services/workspace-stats.util";

const ATTACHMENT_PAGE = 500;

interface StatsJobData {
  /** "YYYY-MM-DD" theo `env.CRON_TZ` — chạy lại/backfill 1 ngày cụ thể; bỏ trống = hôm qua. */
  date?: string;
}

/** Số tin người dùng (kind=USER, gồm reply trong thread, gồm tin sau đó bị thu hồi) gửi trong `[from, to)`. */
function countMessages(workspaceId: string, from: Date, to: Date): Promise<number> {
  return prisma.message.count({ where: { workspaceId, kind: "USER", createdAt: { gte: from, lt: to } } });
}

/**
 * Số TỆP đính kèm (tổng độ dài `Message.attachments[]`) của các tin gửi trong
 * `[from, to)` — đếm theo tin nhắn (nguồn sự thật, không phụ thuộc
 * `Asset.workspaceId` vốn do client tự khai, tuỳ chọn). Chỉ quét tin CÓ tệp,
 * phân trang theo id để không nạp cả ngày vào bộ nhớ.
 */
async function countAttachments(workspaceId: string, from: Date, to: Date): Promise<number> {
  let total = 0;
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.message.findMany({
      where: { workspaceId, kind: "USER", createdAt: { gte: from, lt: to }, attachments: { isEmpty: false } },
      select: { id: true, attachments: true },
      orderBy: { id: "asc" },
      take: ATTACHMENT_PAGE,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });
    total += rows.reduce((sum, r) => sum + r.attachments.length, 0);
    if (rows.length < ATTACHMENT_PAGE) return total;
    cursor = rows[rows.length - 1].id;
  }
}

/**
 * `workspace.stats-daily` (queue `reports`, cron 01:10 theo `env.CRON_TZ` — README
 * p1-01 §7). Tổng kết NGÀY VỪA KẾT THÚC (hôm qua, theo `CRON_TZ`) — không phải
 * hôm nay (lúc 01:10 mới có ~1 giờ dữ liệu):
 *   - `messages`: `Message` kind=USER có `workspaceId` gửi trong `[00:00, 24:00)` hôm đó;
 *   - `files`: tổng số tệp đính kèm của các tin đó;
 *   - `activeMembers`: số thành viên ACTIVE tại lúc job chạy (ảnh chụp cuối ngày).
 *     Chạy bù ngày cũ (`data.date`): dòng CHƯA có được tạo với snapshot hiện tại (xấp xỉ),
 *     dòng ĐÃ có KHÔNG bị ghi đè `activeMembers` (snapshot hiện tại sai với ngày đó).
 * Idempotent (upsert theo `(workspaceId, date)`) — chạy lại/retry an toàn. 1
 * workspace lỗi không chặn cả lượt (chỉ cảnh báo).
 */
registerJob("reports", "workspace.stats-daily", async (job) => {
  const data = (job?.data ?? {}) as StatsJobData;
  const tz = env.CRON_TZ;
  const isBackfill = data.date !== undefined;
  if (isBackfill && !isDayKey(data.date)) {
    throw new Error(`workspace.stats-daily: date không hợp lệ (cần YYYY-MM-DD): ${String(data.date)}`);
  }
  const date = data.date ?? previousDayKey(new Date(), tz);
  const { from, to } = dayRangeUtc(date, tz);

  // Kể cả workspace vừa bị lưu trữ TRONG/SAU ngày đó — họ vẫn có tin của ngày đó.
  const workspaces = await prisma.workspace.findMany({
    where: { OR: [{ status: "ACTIVE" }, { archivedAt: { gte: from } }] },
    select: { id: true },
  });

  let ok = 0;
  for (const { id: workspaceId } of workspaces) {
    try {
      const [messages, files, activeMembers] = await Promise.all([
        countMessages(workspaceId, from, to),
        countAttachments(workspaceId, from, to),
        prisma.workspaceMembership.count({ where: { workspaceId, status: "ACTIVE" } }),
      ]);
      await prisma.workspaceDailyStat.upsert({
        where: { workspaceId_date: { workspaceId, date } },
        create: { workspaceId, date, messages, files, activeMembers },
        update: { messages, files, ...(!isBackfill && { activeMembers }) },
      });
      ok += 1;
    } catch (err) {
      logger.warn("[workspace.stats-daily] Lỗi tính số liệu 1 workspace, bỏ qua", {
        workspaceId,
        date,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info("[workspace.stats-daily] Hoàn tất", { date, tz, total: workspaces.length, ok });
});

defineCron({
  schedulerId: "workspace.stats-daily",
  queue: "reports",
  jobName: "workspace.stats-daily",
  pattern: "10 1 * * *",
  opts: { attempts: 3 },
});
