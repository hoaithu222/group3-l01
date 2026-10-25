import type { Line } from "../types";
import { DAY_MS, Directory, prisma, rngFrom } from "./core";
import type { ChannelCtx } from "./channels";
import { postScript, type PostedMessage } from "./messages";
import type { WorkspaceCtx } from "./workspace";

export interface SeededChannel {
  channel: ChannelCtx;
  posted: PostedMessage[];
}

/** Kiểm tra người gửi/được nhắc/thả cảm xúc đều có quyền nói trong kênh — lỗi nội dung thì dừng sớm, trước khi ghi gì. */
function assertSpeakers(ws: WorkspaceCtx, ch: ChannelCtx, lines: readonly Line[]): void {
  const speakers = new Set<string>();
  for (const [by, text, opts] of lines) {
    speakers.add(by);
    for (const m of text.matchAll(/\{@([a-z0-9_]+)\}/g)) speakers.add(m[1]);
    for (const people of Object.values(opts?.react ?? {})) people.forEach((p) => speakers.add(p));
    for (const [tBy] of opts?.thread ?? []) speakers.add(tBy);
    for (const voters of opts?.poll?.votes ?? []) voters.forEach((p) => speakers.add(p));
  }
  for (const key of speakers) {
    if (!ch.participants.has(key)) {
      throw new Error(`[${ws.spec.key}] kênh "${ch.name}": "${key}" xuất hiện trong kịch bản nhưng không có trong kênh${ch.isPrivate ? " riêng tư" : ""}`);
    }
  }
}

/** Đăng kịch bản vào từng kênh của nhóm rồi đặt mốc đọc của `thu` (chỉ khi có tin mới ở lần chạy này, để chạy lại không xoá tiến độ đọc thật). */
export async function seedChannelMessages(dir: Directory, ws: WorkspaceCtx, channels: readonly ChannelCtx[], now: Date): Promise<SeededChannel[]> {
  const out: SeededChannel[] = [];
  for (const ch of channels) {
    const lines = ch.spec.lines ?? [];
    if (lines.length === 0 || ch.spec.type === "VOICE" || ch.spec.type === "POMODORO") continue;
    assertSpeakers(ws, ch, lines);

    const rng = rngFrom(`channel-window:${ws.spec.key}:${ch.name}`);
    const last = await prisma.message.findFirst({ where: { scopeType: "CHANNEL", scopeId: ch.id, threadKey: "root" }, orderBy: { seq: "desc" }, select: { createdAt: true } });
    const from = new Date(Math.max(ch.createdAt.getTime() + 1_800_000, ws.createdAt.getTime() + 3_600_000, (last?.createdAt.getTime() ?? 0) + 60_000));
    // Có kênh vừa sôi nổi hôm nay, có kênh đã lặng vài ngày — nhìn giống nhóm thật hơn.
    const tailGap = rng() < 0.45 ? rng() * 4 * 3_600_000 : rng() * 2.5 * DAY_MS;
    const to = new Date(now.getTime() - tailGap - 900_000);

    const posted = await postScript({ dir, scope: { type: "CHANNEL", id: ch.id, workspaceId: ws.id }, baseKey: `${ws.spec.key}:${ch.name}`, lines, from, to, now, pinnedBy: ws.spec.owner });
    out.push({ channel: ch, posted });

    if (ws.roles.has("thu") && ch.participants.has("thu") && posted.some((p) => p.fresh)) {
      await setThuReadState(dir, ws, ch, posted, ch.spec.unreadForThu ?? 0);
    }
  }
  return out;
}

async function setThuReadState(dir: Directory, ws: WorkspaceCtx, ch: ChannelCtx, posted: readonly PostedMessage[], unread: number): Promise<void> {
  const thuId = dir.id("thu");
  const lastSeq = Math.max(...posted.map((p) => p.seq));
  let lastReadSeq = lastSeq;
  if (unread > 0) {
    const others = posted.filter((p) => p.by !== "thu").sort((a, b) => b.seq - a.seq).slice(0, unread);
    const oldest = others[others.length - 1];
    if (oldest) lastReadSeq = oldest.seq - 1;
  }
  const lastAt = posted.reduce((max, p) => (p.createdAt > max ? p.createdAt : max), posted[0].createdAt);
  const key = { userId_streamType_streamId: { userId: thuId, streamType: "CHANNEL" as const, streamId: ch.id } };
  const data = { workspaceId: ws.id, channelId: ch.id, lastReadSeq, lastReadAt: lastAt };
  await prisma.readState.upsert({ where: key, create: { userId: thuId, streamType: "CHANNEL", streamId: ch.id, ...data }, update: data });
}
