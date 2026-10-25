/**
 * Thông báo toàn nhóm có xác nhận "Đã đọc" (module `announcements`, p5-04): tin gốc nằm trong kênh `ADMINS_ONLY` ("Thông báo"), kèm `AnnouncementRequest`
 * (hạn xác nhận, `confirmedCount` phi chuẩn hoá) và `AnnouncementReceipt` — chỉ có khi người nhận CHỦ ĐỘNG bấm. Audience thật = thành viên ACTIVE không phải khách,
 * trừ người yêu cầu (như `channelReaderIds`). Thông báo hộp thư `announcement.required` ghi trực tiếp (không outbox/push). Chỉ người có khoá trong seed mới có biên nhận.
 */
import { DAY_MS, MIN_MS, prisma, rngFrom } from "../core";
import { postScript } from "../messages";
import type { ModuleCtx } from "../module-ctx";
import type { WorkspaceCtx } from "../workspace";
import { ANNOUNCEMENTS } from "./extras-announcements.content";
import { ensureAuxChannel, setReadMark } from "./extras-channels";
import { atIct, dateKit } from "./ict";
import { insertNotification } from "./notify-util";

export interface AnnouncementTally {
  channels: number;
  announcements: number;
  receipts: number;
  notifications: number;
  skipped: string[];
}

interface Reader {
  userId: string;
  key: string | undefined;
  joinedAt: Date;
}

/** Người đọc được kênh công khai: thành viên ACTIVE không phải GUEST (khách hết hạn không có ở đây vì seed không tạo khách). */
async function readersOf(c: ModuleCtx, ws: WorkspaceCtx): Promise<Reader[]> {
  const rows = await prisma.workspaceMembership.findMany({ where: { workspaceId: ws.id, status: "ACTIVE", role: { not: "GUEST" } }, select: { userId: true, joinedAt: true, role: true } });
  return rows.map((r) => ({ userId: r.userId, key: c.dir.keyOfId(r.userId), joinedAt: r.role === "OWNER" ? ws.createdAt : r.joinedAt }));
}

export async function runAnnouncements(c: ModuleCtx, t: AnnouncementTally): Promise<void> {
  const { dir, now } = c;
  const d = dateKit(now);
  for (const [wsKey, ws] of c.workspaces) {
    const specs = ANNOUNCEMENTS[wsKey];
    if (!specs) continue;
    const channel = await ensureAuxChannel(dir, ws, now, {
      name: "Thông báo",
      description: "Thông báo chính thức của nhóm — chỉ quản trị viên đăng, người nhận bấm \"Đã đọc\" để xác nhận",
      postingPolicy: "ADMINS_ONLY",
      lifeFraction: 0.04,
    });
    if (channel.postingPolicy !== "ADMINS_ONLY") {
      t.skipped.push(`${wsKey}: kênh "${channel.name}" đã có nhưng không phải ADMINS_ONLY`);
      continue;
    }
    if (channel.isNew) t.channels += 1;
    const readers = await readersOf(c, ws);
    const thuId = dir.id("thu");
    let previous = new Date(channel.createdAt.getTime() + 30 * MIN_MS);
    let freshInChannel = false;
    let firstUnreadForThu = Infinity;
    let lastSeq = 0;

    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      const role = ws.roles.get(spec.by);
      if (role !== "OWNER" && role !== "ADMIN") throw new Error(`[${wsKey}] thông báo #${i}: "${spec.by}" không phải OWNER/ADMIN`);
      const authorId = dir.id(spec.by);
      const audience = readers.filter((r) => r.userId !== authorId);

      const requested = atIct(now, -spec.daysAgo, spec.hour, 10 + ((i * 17) % 40));
      // Không đăng quá sớm trong đời nhóm (để đã có người trong nhóm): thông báo thứ i nằm sau 30% + 35% × i/(n−1) vòng đời nhóm.
      const lifeSoFar = Math.max(now.getTime() - ws.createdAt.getTime(), DAY_MS);
      const earliest = ws.createdAt.getTime() + lifeSoFar * (0.3 + (specs.length > 1 ? (0.35 * i) / (specs.length - 1) : 0));
      const from = new Date(Math.min(Math.max(requested.getTime(), earliest, previous.getTime() + 60 * MIN_MS), now.getTime() - 3 * 60 * MIN_MS));
      const to = new Date(Math.min(from.getTime() + 25 * MIN_MS, now.getTime() - 2 * MIN_MS));

      // Ai sẽ bấm "Đã đọc" (tất định theo nhóm/thông báo/người). Người vào nhóm SAU lúc đăng vẫn xác nhận được nếu thông báo còn hiệu lực khi họ vào.
      const confirmers = audience.filter((r) => {
        if (!r.key) return false;
        if (r.key === "thu" && spec.thuConfirmed !== undefined) return spec.thuConfirmed;
        return rngFrom(`announce:${wsKey}:${i}:${r.key}`)() < spec.ratio;
      });
      const reactors = confirmers.flatMap((r) => (r.key && r.key !== "thu" && r.joinedAt < from ? [r.key] : [])).slice(0, 5);

      const baseKey = `${wsKey}:thong-bao:${i}`;
      const [posted] = await postScript({
        dir,
        scope: { type: "CHANNEL", id: channel.id, workspaceId: ws.id },
        baseKey,
        lines: [[spec.by, spec.text(d), { ...(spec.pin ? { pin: true } : {}), ...(reactors.length > 0 ? { react: { "👍": reactors } } : {}) }]],
        from,
        to,
        now,
        pinnedBy: spec.by,
      });
      previous = posted.createdAt;
      lastSeq = Math.max(lastSeq, posted.seq);
      if (posted.fresh) freshInChannel = true;

      if (await prisma.announcementRequest.findUnique({ where: { messageId: posted.id }, select: { id: true } })) continue;

      const deadlineAt = spec.deadlineDays === null ? null : new Date(posted.createdAt.getTime() + spec.deadlineDays * DAY_MS);
      const active = deadlineAt === null || deadlineAt > now;
      const requestAt = new Date(posted.createdAt.getTime() + 90_000);
      const request = await prisma.announcementRequest.create({
        data: {
          messageId: posted.id,
          channelId: channel.id,
          workspaceId: ws.id,
          requestedBy: authorId,
          // Quy ước Mongo null-vs-absent: ghi null tường minh (bộ lọc `{ cancelledAt: null }`).
          deadlineAt,
          confirmedCount: 0,
          cancelledAt: null,
          cancelledBy: null,
          createdAt: requestAt,
          updatedAt: requestAt,
        },
      });

      const upper = new Date(Math.min(deadlineAt?.getTime() ?? Infinity, now.getTime()) - 2 * MIN_MS);
      const receipts: Array<{ userId: string; confirmedAt: Date }> = [];
      for (const r of confirmers) {
        const start = Math.max(posted.createdAt.getTime() + 5 * MIN_MS, r.joinedAt.getTime() + 10 * MIN_MS);
        const room = upper.getTime() - start;
        if (room <= 0) continue; // vào nhóm khi thông báo đã hết hạn
        const rng = rngFrom(`announce-at:${wsKey}:${i}:${r.key}`);
        receipts.push({ userId: r.userId, confirmedAt: new Date(start + Math.floor(rng() * Math.min(30 * 3_600_000, room))) });
      }
      if (receipts.length > 0) {
        await prisma.announcementReceipt.createMany({ data: receipts.map((x) => ({ requestId: request.id, userId: x.userId, confirmedAt: x.confirmedAt })) });
      }
      await prisma.announcementRequest.update({ where: { id: request.id }, data: { confirmedCount: receipts.length, updatedAt: requestAt } });
      t.announcements += 1;
      t.receipts += receipts.length;

      // Hộp thư: mỗi người nhận biết trong seed (đã vào nhóm trước lúc đăng) có một thông báo; đã bấm "Đã đọc" ⇒ đã đọc; hết hạn ⇒ coi như đã xem.
      const doneAt = new Map(receipts.map((x) => [x.userId, x.confirmedAt]));
      const sourceId = `announcement.required:${request.id}`;
      const recipients = audience
        .filter((r) => r.key && r.joinedAt < posted.createdAt)
        .map((r) => ({ userId: r.userId, readAt: doneAt.get(r.userId) ?? (active ? null : new Date(Math.min(posted.createdAt.getTime() + 6 * 3_600_000, now.getTime()))) }));
      const res = await insertNotification({
        type: "announcement.required",
        scopeType: "CHANNEL",
        scopeId: channel.id,
        workspaceId: ws.id,
        actorId: authorId,
        sourceType: "Announcement",
        sourceId,
        refs: { workspaceId: ws.id, channelId: channel.id, messageId: posted.id, ...(deadlineAt ? { deadlineAt: deadlineAt.toISOString() } : {}) },
        dedupeKey: sourceId,
        createdAt: new Date(posted.createdAt.getTime() + 2000),
        recipients,
      });
      if (res.created) t.notifications += 1;

      const thuIsReader = audience.some((r) => r.userId === thuId);
      if (thuIsReader && active && !doneAt.has(thuId)) firstUnreadForThu = Math.min(firstUnreadForThu, posted.seq);
    }

    // Mốc đọc của thu: tin chưa xác nhận còn hiệu lực hiện là "chưa đọc" (hiện huy hiệu Cần xác nhận); các tin còn lại đã đọc.
    if (freshInChannel) await setReadMark(dir, ws, channel.id, Number.isFinite(firstUnreadForThu) ? firstUnreadForThu - 1 : lastSeq, new Date(previous.getTime() + 3 * MIN_MS));
  }
}
