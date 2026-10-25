import { normalizeSearch } from "../../../../src/core/utils/normalize";
import { DAY_MS, Directory, prisma, rngFrom } from "../core";
import type { WorkspaceCtx } from "../workspace";

export interface AuxChannel {
  id: string;
  name: string;
  createdAt: Date;
  postingPolicy: "MEMBERS" | "ADMINS_ONLY";
  /** `true` khi kênh vừa được tạo ở lần chạy này. */
  isNew: boolean;
}

/**
 * Kênh công khai phụ (vd "Thông báo" chỉ quản trị đăng, "GitHub" nhận tin tự động) — cùng bộ trường mà `ChannelService.create` ghi:
 * kênh + `Counter ch:<id>` + `ChannelMembership` cho mọi thành viên ACTIVE của nhóm (người vào nhóm sau lúc tạo kênh được tính từ lúc vào nhóm).
 * Đã có kênh trùng tên (đã chuẩn hoá) thì dùng lại, KHÔNG đổi chính sách đăng bài của nó (người gọi tự kiểm `postingPolicy`).
 */
export async function ensureAuxChannel(
  dir: Directory,
  ws: WorkspaceCtx,
  now: Date,
  spec: { name: string; description: string; postingPolicy: "MEMBERS" | "ADMINS_ONLY"; lifeFraction: number }
): Promise<AuxChannel> {
  const normalizedName = normalizeSearch(spec.name);
  let channel = await prisma.channel.findUnique({ where: { workspaceId_normalizedName: { workspaceId: ws.id, normalizedName } } });
  let isNew = false;
  if (!channel) {
    isNew = true;
    const life = Math.max(now.getTime() - ws.createdAt.getTime(), DAY_MS);
    const rng = rngFrom(`aux-channel:${ws.spec.key}:${normalizedName}`);
    const createdAt = new Date(Math.min(ws.createdAt.getTime() + Math.floor(life * (spec.lifeFraction + rng() * 0.05)), now.getTime() - 3_600_000));
    const last = await prisma.channel.findFirst({ where: { workspaceId: ws.id }, orderBy: { position: "desc" }, select: { position: true } });
    channel = await prisma.channel.create({
      data: {
        workspaceId: ws.id,
        name: spec.name,
        normalizedName,
        description: spec.description,
        type: "TEXT",
        visibility: "PUBLIC",
        postingPolicy: spec.postingPolicy,
        position: (last?.position ?? 0) + 1,
        memberCount: 0,
        createdBy: ws.ownerId,
        createdAt,
      },
    });
    await prisma.counter.create({ data: { key: `ch:${channel.id}`, seq: 0 } });
  }

  const members = await prisma.workspaceMembership.findMany({ where: { workspaceId: ws.id, status: "ACTIVE", role: { not: "GUEST" } }, select: { userId: true, role: true, joinedAt: true } });
  const already = new Set((await prisma.channelMembership.findMany({ where: { channelId: channel.id }, select: { userId: true } })).map((m) => m.userId));
  for (const m of members) {
    if (already.has(m.userId)) continue;
    const joinedAt = m.role === "OWNER" ? channel.createdAt : new Date(Math.max(channel.createdAt.getTime(), m.joinedAt.getTime()));
    await prisma.channelMembership.create({ data: { channelId: channel.id, workspaceId: ws.id, userId: m.userId, joinedAt: new Date(Math.min(joinedAt.getTime(), now.getTime())) } });
  }
  const memberCount = await prisma.channelMembership.count({ where: { channelId: channel.id } });
  if (channel.memberCount !== memberCount) await prisma.channel.update({ where: { id: channel.id }, data: { memberCount } });
  return { id: channel.id, name: channel.name, createdAt: channel.createdAt, postingPolicy: channel.postingPolicy, isNew };
}

/** Mốc đọc của `thu` trong một kênh (chỉ gọi khi vừa có tin mới ở lần chạy này — không xoá tiến độ đọc thật khi chạy lại). */
export async function setReadMark(dir: Directory, ws: WorkspaceCtx, channelId: string, lastReadSeq: number, lastReadAt: Date): Promise<void> {
  if (!ws.roles.has("thu")) return;
  const userId = dir.id("thu");
  const key = { userId_streamType_streamId: { userId, streamType: "CHANNEL" as const, streamId: channelId } };
  const data = { workspaceId: ws.id, channelId, lastReadSeq, lastReadAt };
  await prisma.readState.upsert({ where: key, create: { userId, streamType: "CHANNEL", streamId: channelId, ...data }, update: data });
}
