import { DAY_MS, prisma } from "./core";
import type { WorkspaceCtx } from "./workspace";

/** Khoá ngày theo giờ Việt Nam ("YYYY-MM-DD") — khớp `CRON_TZ` mặc định của job `workspace.stats-daily`. */
function dayKeyVn(d: Date): string {
  return new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * Số liệu hoạt động theo ngày (biểu đồ admin/overview) dựng từ tin nhắn thật của nhóm trong 30 ngày qua, và cập nhật
 * `lastActivityAt`. Ngày đã có số liệu (do job thật ghi) được giữ nguyên. Trả về số ngày mới.
 */
export async function seedWorkspaceStats(ws: WorkspaceCtx, now: Date): Promise<number> {
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const messages = await prisma.message.findMany({
    where: { workspaceId: ws.id, createdAt: { gte: since }, deletedAt: null },
    select: { authorId: true, createdAt: true },
  });
  if (messages.length === 0) return 0;

  const byDay = new Map<string, { messages: number; authors: Set<string> }>();
  for (const m of messages) {
    const key = dayKeyVn(m.createdAt);
    const bucket = byDay.get(key) ?? { messages: 0, authors: new Set<string>() };
    bucket.messages += 1;
    if (m.authorId) bucket.authors.add(m.authorId);
    byDay.set(key, bucket);
  }

  let created = 0;
  for (const [date, b] of byDay) {
    const exists = await prisma.workspaceDailyStat.findUnique({ where: { workspaceId_date: { workspaceId: ws.id, date } }, select: { id: true } });
    if (exists) continue;
    await prisma.workspaceDailyStat.create({ data: { workspaceId: ws.id, date, messages: b.messages, activeMembers: b.authors.size, files: 0 } });
    created += 1;
  }

  const latest = messages.reduce((max, m) => (m.createdAt > max ? m.createdAt : max), messages[0].createdAt);
  await prisma.workspace.updateMany({ where: { id: ws.id, lastActivityAt: { lt: latest } }, data: { lastActivityAt: latest } });
  return created;
}
