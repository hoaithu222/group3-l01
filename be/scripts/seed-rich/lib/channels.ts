import { normalizeSearch } from "../../../src/core/utils/normalize";
import type { ChannelSpec, Line, PersonKey } from "../types";
import { DAY_MS, Directory, prisma, rngFrom } from "./core";
import type { WorkspaceCtx } from "./workspace";

export interface ChannelCtx {
  id: string;
  spec: ChannelSpec;
  name: string;
  isPrivate: boolean;
  createdAt: Date;
  /** Những người đã tham gia kênh (khoá) — dùng để kiểm tra người gửi hợp lệ. */
  participants: Set<PersonKey>;
}

const MENTION_RE = /\{@([a-z0-9_]+)\}/g;

/** Mọi khoá người xuất hiện trong kịch bản: người gửi, được nhắc, thả cảm xúc, trả lời trong luồng, bỏ phiếu. */
export function participantsOf(lines: readonly Line[]): Set<PersonKey> {
  const out = new Set<PersonKey>();
  for (const [by, text, opts] of lines) {
    out.add(by);
    for (const m of text.matchAll(MENTION_RE)) out.add(m[1]);
    for (const people of Object.values(opts?.react ?? {})) people.forEach((p) => out.add(p));
    for (const [tBy, tText] of opts?.thread ?? []) {
      out.add(tBy);
      for (const m of tText.matchAll(MENTION_RE)) out.add(m[1]);
    }
    for (const voters of opts?.poll?.votes ?? []) voters.forEach((p) => out.add(p));
  }
  return out;
}

/**
 * Tạo (nếu chưa có) các kênh của nhóm rồi cho người tham gia. Kênh công khai: ChannelMembership cho người theo dõi; kênh riêng tư:
 * ChannelGrant (chủ nhóm = MANAGER, còn lại MEMBER) kèm ChannelMembership — đúng cách `ChannelService.create` ghi.
 */
export async function ensureChannels(dir: Directory, ctx: WorkspaceCtx, now: Date): Promise<ChannelCtx[]> {
  const out: ChannelCtx[] = [];
  let index = 0;
  for (const spec of ctx.spec.channels) {
    index += 1;
    const normalizedName = normalizeSearch(spec.name);
    const isPrivate = Boolean(spec.private);
    let channel = await prisma.channel.findUnique({ where: { workspaceId_normalizedName: { workspaceId: ctx.id, normalizedName } } });

    if (!channel) {
      const rng = rngFrom(`channel:${ctx.spec.key}:${normalizedName}`);
      const life = Math.max(now.getTime() - ctx.createdAt.getTime(), DAY_MS);
      const createdAt = new Date(ctx.createdAt.getTime() + Math.floor(life * (0.02 + rng() * 0.25)));
      channel = await prisma.channel.create({
        data: {
          workspaceId: ctx.id,
          name: spec.name,
          normalizedName,
          description: spec.description ?? null,
          type: spec.type ?? "TEXT",
          visibility: isPrivate ? "PRIVATE" : "PUBLIC",
          postingPolicy: "MEMBERS",
          position: index,
          memberCount: 0,
          createdBy: ctx.ownerId,
          createdAt,
        },
      });
      await prisma.counter.create({ data: { key: `ch:${channel.id}`, seq: 0 } });
    }

    const participants = new Set<PersonKey>([ctx.spec.owner]);
    if (isPrivate) {
      for (const key of spec.private ?? []) participants.add(key);
    } else if (spec.followers === "all") {
      for (const key of ctx.roles.keys()) participants.add(key);
    } else {
      for (const key of [...(spec.followers ?? []), ...participantsOf(spec.lines ?? [])]) participants.add(key);
      if (ctx.roles.has("thu")) participants.add("thu");
    }

    for (const key of participants) {
      if (!ctx.roles.has(key)) throw new Error(`[${ctx.spec.key}] kênh "${spec.name}": "${key}" không phải thành viên nhóm`);
      const userId = dir.id(key);
      if (isPrivate) await ensureGrant(ctx, channel.id, userId, key === ctx.spec.owner ? "MANAGER" : "MEMBER");
      const joined = await prisma.channelMembership.findUnique({ where: { channelId_userId: { channelId: channel.id, userId } } });
      if (!joined) {
        await prisma.channelMembership.create({
          data: { channelId: channel.id, workspaceId: ctx.id, userId, joinedAt: new Date(Math.max(channel.createdAt.getTime(), ctx.createdAt.getTime())) },
        });
      }
    }

    const memberCount = await prisma.channelMembership.count({ where: { channelId: channel.id } });
    if (channel.memberCount !== memberCount) await prisma.channel.update({ where: { id: channel.id }, data: { memberCount } });

    out.push({ id: channel.id, spec, name: channel.name, isPrivate: channel.visibility === "PRIVATE", createdAt: channel.createdAt, participants });
  }
  return out;
}

async function ensureGrant(ctx: WorkspaceCtx, channelId: string, userId: string, level: "MANAGER" | "MEMBER"): Promise<void> {
  const subjectKey = userId;
  const existing = await prisma.channelGrant.findUnique({ where: { channelId_subjectKey_source: { channelId, subjectKey, source: "DIRECT" } } });
  if (existing) return;
  await prisma.channelGrant.create({
    data: { channelId, workspaceId: ctx.id, userId, subjectKey, level, source: "DIRECT", roleRef: null, grantedBy: ctx.ownerId },
  });
}
