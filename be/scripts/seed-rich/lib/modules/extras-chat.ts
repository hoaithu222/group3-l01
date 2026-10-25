/**
 * Tiện ích chat của `thu` (module `chat-extensions` + `discovery`): tin hẹn giờ (`ScheduledMessage` PENDING, chưa phải `Message` nên không lộ trong kênh),
 * nhắc lại tin (`MessageReminder`) gắn với TIN THẬT đã seed, và tin đã lưu (`SavedMessage`). Không xếp outbox: tin hẹn giờ/nhắc ĐANG CHỜ vẫn được cron
 * `chat-extensions.sweep` của BE bắt khi lỡ giờ nên sẽ chạy đúng lúc đến hạn như tin thật. Nhắc đã phát ghi kèm thông báo `message.reminder` (không push).
 */
import type { Prisma } from "@prisma/client";
import { DAY_MS, MIN_MS, prisma, rngFrom } from "../core";
import type { ModuleCtx } from "../module-ctx";
import { SCHEDULED, TIMEZONE } from "./extras-chat.content";
import { atIct, dateKit } from "./ict";
import { insertNotification } from "./notify-util";

export interface ChatTally {
  scheduled: number;
  reminders: number;
  firedReminders: number;
  saved: number;
  notifications: number;
}

const REMINDER_TARGET = 4;
const SAVED_TARGET = 7;
const KEYWORDS = /deadline|nộp|hạn|họp|lịch|thi\b|quy định|chốt|nhớ|nhắc|link|tài liệu|bảo vệ|demo/i;
/** Từ khoá "có việc phải làm vào một thời điểm" — hợp để nhắc lại tin. */
const DUE = /deadline|nộp|hạn|họp|lịch|thi\b|bảo vệ|demo|chốt|quy định/i;

interface Candidate {
  id: string;
  scopeId: string;
  workspaceId: string | null;
  threadId: string | null;
  content: string;
  pinned: boolean;
  mentionsThu: boolean;
  reactions: number;
  /** Tin nằm trong kênh chỉ quản trị đăng (kênh Thông báo). */
  announcement: boolean;
  createdAt: Date;
}

/** Tin đọc được của thu (kênh chữ đang hoạt động mà thu là thành viên; kênh riêng cần có quyền), của người khác, chưa gỡ, trong 15 ngày qua. */
async function candidatesOf(c: ModuleCtx): Promise<Candidate[]> {
  const thuId = c.dir.id("thu");
  const memberships = await prisma.channelMembership.findMany({ where: { userId: thuId }, select: { channelId: true } });
  const channels = await prisma.channel.findMany({ where: { id: { in: memberships.map((m) => m.channelId) }, type: "TEXT", status: "ACTIVE" }, select: { id: true, visibility: true, workspaceId: true, postingPolicy: true } });
  const grants = await prisma.channelGrant.findMany({ where: { userId: thuId, channelId: { in: channels.map((x) => x.id) } }, select: { channelId: true } });
  const granted = new Set(grants.map((g) => g.channelId));
  const activeWs = new Set([...c.workspaces.values()].filter((w) => w.roles.has("thu")).map((w) => w.id));
  const usable = channels.filter((x) => activeWs.has(x.workspaceId) && (x.visibility === "PUBLIC" || granted.has(x.id)));
  const ids = usable.map((x) => x.id);
  const announceChannels = new Set(usable.filter((x) => x.postingPolicy === "ADMINS_ONLY").map((x) => x.id));
  const rows = await prisma.message.findMany({
    where: { scopeType: "CHANNEL", scopeId: { in: ids }, kind: "USER", deletedAt: null, authorId: { not: thuId }, createdAt: { gte: new Date(c.now.getTime() - 15 * DAY_MS), lte: new Date(c.now.getTime() - 30 * MIN_MS) } },
    select: { id: true, scopeId: true, workspaceId: true, threadId: true, content: true, pinnedAt: true, mentions: true, reactionsSummary: true, createdAt: true },
    take: 4000,
  });
  return rows
    .filter((m) => (m.content ?? "").length >= 30)
    .map((m) => ({
      id: m.id,
      scopeId: m.scopeId,
      workspaceId: m.workspaceId,
      threadId: m.threadId,
      content: m.content ?? "",
      pinned: m.pinnedAt !== null,
      mentionsThu: m.mentions.some((x) => x.targetId === thuId),
      reactions: m.reactionsSummary.reduce((n, r) => n + r.count, 0),
      announcement: announceChannels.has(m.scopeId),
      createdAt: m.createdAt,
    }));
}

/** Chọn `n` tin điểm cao nhất, ưu tiên mỗi nhóm một tin trước (đa dạng); điểm hoà phân theo thời gian mới hơn rồi id. */
function pickDiverse(cands: Candidate[], n: number, score: (m: Candidate) => number, avoid: ReadonlySet<string>, perChannelMax = 99): Candidate[] {
  const sorted = cands.filter((m) => !avoid.has(m.id) && score(m) > 0).sort((a, b) => score(b) - score(a) || b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
  const out: Candidate[] = [];
  const perWs = new Map<string, number>();
  const perChannel = new Map<string, number>();
  for (const cap of [1, 2, 3]) {
    for (const m of sorted) {
      if (out.length >= n) return out;
      const w = m.workspaceId ?? "-";
      if (out.includes(m) || (perWs.get(w) ?? 0) >= cap || (perChannel.get(m.scopeId) ?? 0) >= perChannelMax) continue;
      out.push(m);
      perWs.set(w, (perWs.get(w) ?? 0) + 1);
      perChannel.set(m.scopeId, (perChannel.get(m.scopeId) ?? 0) + 1);
    }
  }
  return out;
}

async function seedScheduled(c: ModuleCtx, t: ChatTally): Promise<void> {
  const { dir, now } = c;
  const d = dateKit(now);
  const thuId = dir.id("thu");
  for (const spec of SCHEDULED) {
    const ws = c.workspaces.get(spec.ws);
    if (!ws || !ws.roles.has("thu")) continue;
    const content = spec.text(d);
    const sendAt = atIct(now, spec.days(d), spec.hour, spec.minute);
    if (sendAt.getTime() <= now.getTime() + 30 * MIN_MS) continue; // phải ở tương lai đủ xa (BE đòi ≥ 60 giây)
    if (await prisma.scheduledMessage.findFirst({ where: { authorId: thuId, scopeType: "CHANNEL", scopeId: ws.defaultChannelId, content }, select: { id: true } })) continue;
    const rng = rngFrom(`scheduled:${spec.ws}:${spec.hour}`);
    const createdAt = new Date(Math.max(ws.createdAt.getTime() + 3_600_000, now.getTime() - (2 + Math.floor(rng() * 40)) * 3_600_000));
    await prisma.scheduledMessage.create({
      data: {
        authorId: thuId,
        scopeType: "CHANNEL",
        scopeId: ws.defaultChannelId,
        threadId: null,
        workspaceId: ws.id,
        content,
        mentions: [],
        attachmentAssetIds: [],
        replyToId: null,
        sendAt,
        timezone: TIMEZONE,
        status: "PENDING",
        // Quy ước Mongo null-vs-absent: các trường nullable sau này lọc bằng `{field: null}` ghi null tường minh.
        messageId: null,
        failReason: null,
        failCode: null,
        attempts: 0,
        sentAt: null,
        cancelledAt: null,
        version: 1,
        createdAt,
        updatedAt: createdAt,
      },
    });
    t.scheduled += 1;
  }
}

function reminderScore(m: Candidate): number {
  const code = /[`{}]|=>/.test(m.content) ? 4 : 0;
  return (DUE.test(m.content) ? 5 : 0) + (KEYWORDS.test(m.content) ? 1 : 0) + (m.mentionsThu ? 2 : 0) + (m.pinned ? 1 : 0) - code;
}

async function seedReminders(c: ModuleCtx, cands: Candidate[], t: ChatTally): Promise<Set<string>> {
  const { dir, now } = c;
  const thuId = dir.id("thu");
  const existing = await prisma.messageReminder.findMany({ where: { userId: thuId, status: { in: ["PENDING", "FIRED"] } }, select: { messageId: true } });
  const taken = new Set(existing.map((r) => r.messageId));
  const need = REMINDER_TARGET - existing.length;
  if (need <= 0) return taken;

  // Lần đầu: một nhắc ĐÃ PHÁT (tối qua, kèm thông báo) + các nhắc đang chờ (sắp tới trong vài giờ, sáng mai, tối ngày kia). Bổ sung thêm thì chỉ thêm nhắc đang chờ.
  const firedAt = atIct(now, -1, 20, 0);
  const roots = cands.filter((m) => m.threadId === null);
  const firedPick = existing.length === 0 ? pickDiverse(roots.filter((m) => m.createdAt.getTime() < firedAt.getTime() - 3 * 3_600_000), 1, reminderScore, taken)[0] : undefined;
  const pendingPicks = pickDiverse(roots, need - (firedPick ? 1 : 0), reminderScore, new Set([...taken, ...(firedPick ? [firedPick.id] : [])]));
  // Khung giờ nhắc: vài giờ nữa (nếu rơi vào ban đêm thì 7h30 sáng mai), trưa mai, tối ngày kia.
  const soon = new Date(Math.ceil((now.getTime() + 3 * 3_600_000) / (15 * MIN_MS)) * 15 * MIN_MS);
  const soonHour = (soon.getUTCHours() + 7) % 24;
  const pendingSlots = [soonHour >= 7 && soonHour < 22 ? soon : atIct(now, 1, 7, 30), atIct(now, 1, 12, 15), atIct(now, 3, 19, 30)];
  const plan: Array<{ at: Date; fired: boolean; msg: Candidate }> = [
    ...(firedPick ? [{ at: firedAt, fired: true, msg: firedPick }] : []),
    ...pendingPicks.map((msg, i) => ({ at: pendingSlots[i % pendingSlots.length], fired: false, msg })),
  ];
  for (const { at, fired, msg } of plan) {
    const slot = { at, fired };
    const rng = rngFrom(`reminder:${msg.id}`);
    const createdAt = new Date(Math.min(Math.max(msg.createdAt.getTime() + 5 * MIN_MS, slot.at.getTime() - (2 + Math.floor(rng() * 30)) * 3_600_000), now.getTime() - 10 * MIN_MS));
    const base = {
      userId: thuId,
      messageId: msg.id,
      scopeType: "CHANNEL" as const,
      scopeId: msg.scopeId,
      workspaceId: msg.workspaceId,
      remindAt: slot.at,
      timezone: TIMEZONE,
      unavailable: false,
      cancelledAt: null,
      createdAt,
    };
    if (!slot.fired) {
      await prisma.messageReminder.create({ data: { ...base, status: "PENDING", firedAt: null, notificationId: null, updatedAt: createdAt } });
      t.reminders += 1;
      continue;
    }
    const firedMoment = new Date(slot.at.getTime() + 20_000);
    const reminder = await prisma.messageReminder.create({ data: { ...base, status: "FIRED", firedAt: firedMoment, notificationId: null, updatedAt: firedMoment } });
    const sourceId = reminder.id;
    const res = await insertNotification({
      type: "message.reminder",
      scopeType: "NONE",
      workspaceId: null,
      actorId: null,
      sourceType: "MessageReminder",
      sourceId,
      refs: { reminderId: reminder.id, messageId: msg.id, scopeType: "CHANNEL", scopeId: msg.scopeId },
      dedupeKey: `message-reminder:${reminder.id}`,
      createdAt: firedMoment,
      recipients: [{ userId: thuId, readAt: null }],
    });
    if (res.id) await prisma.messageReminder.update({ where: { id: reminder.id }, data: { notificationId: res.id, updatedAt: firedMoment } });
    t.reminders += 1;
    t.firedReminders += 1;
    t.notifications += res.created ? 1 : 0;
  }
  return new Set([...taken, ...plan.map((p) => p.msg.id)]);
}

function savedScore(m: Candidate): number {
  // Tin thông báo chỉ là phần bổ sung (điểm thấp hơn tin ghim trong các kênh thảo luận) để danh sách đa dạng.
  return (m.pinned ? 5 : 0) + (m.mentionsThu ? 3 : 0) + (KEYWORDS.test(m.content) ? 2 : 0) + Math.min(m.reactions, 4) + (m.content.length >= 80 ? 1 : 0) - (m.announcement ? 6 : 0);
}

async function seedSaved(c: ModuleCtx, cands: Candidate[], avoid: ReadonlySet<string>, t: ChatTally): Promise<void> {
  const { dir, now } = c;
  const thuId = dir.id("thu");
  const saved = await prisma.savedMessage.findMany({ where: { userId: thuId }, select: { messageId: true } });
  const have = new Set(saved.map((s) => s.messageId));
  const need = SAVED_TARGET - saved.length;
  if (need <= 0) return;
  // Phần lớn là tin quan trọng (ghim, quy định, lịch); thêm 1 tin trả lời trong luồng để màn "Tin đã lưu" có cả hai dạng.
  const roots = pickDiverse(cands.filter((m) => m.threadId === null), Math.max(0, need - 1), savedScore, new Set([...avoid, ...have]), 2);
  const threaded = pickDiverse(cands.filter((m) => m.threadId !== null && m.content.length >= 50), 1, savedScore, new Set([...avoid, ...have, ...roots.map((m) => m.id)]));
  for (const msg of [...roots, ...threaded]) {
    const rng = rngFrom(`saved:${msg.id}`);
    const createdAt = new Date(Math.min(msg.createdAt.getTime() + (10 + Math.floor(rng() * 36 * 60)) * MIN_MS, now.getTime() - 5 * MIN_MS));
    const data: Prisma.SavedMessageUncheckedCreateInput = { userId: thuId, messageId: msg.id, scopeType: "CHANNEL", scopeId: msg.scopeId, workspaceId: msg.workspaceId, threadId: msg.threadId, createdAt };
    await prisma.savedMessage.create({ data });
    t.saved += 1;
  }
}

export async function runChatExtras(c: ModuleCtx): Promise<ChatTally> {
  const t: ChatTally = { scheduled: 0, reminders: 0, firedReminders: 0, saved: 0, notifications: 0 };
  if (![...c.workspaces.values()].some((w) => w.roles.has("thu"))) return t;
  await seedScheduled(c, t);
  const cands = await candidatesOf(c);
  const reminded = await seedReminders(c, cands, t);
  await seedSaved(c, cands, reminded, t);
  return t;
}

