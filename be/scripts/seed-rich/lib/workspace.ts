import { createHash, randomBytes } from "crypto";
import { normalizeSearch } from "../../../src/core/utils/normalize";
import { normalizeEmail } from "../../../src/core/auth/normalize-email";
import type { PersonKey, WorkspaceSpec } from "../types";
import { DAY_MS, Directory, prisma, rngFrom } from "./core";

export type Role = "OWNER" | "ADMIN" | "MEMBER";

export interface WorkspaceCtx {
  spec: WorkspaceSpec;
  id: string;
  ownerId: string;
  createdAt: Date;
  defaultChannelId: string;
  isNew: boolean;
  /** Vai trò của từng khoá người đã ACTIVE trong nhóm (kể cả người có sẵn trước seed, nếu có khoá trong `Directory`). */
  roles: Map<PersonKey, Role>;
}

/**
 * Tìm nhóm theo (chủ, tên chuẩn hoá) — có thì dùng lại (bổ sung trường còn trống), chưa có thì tạo mới cùng kênh mặc định "Chung".
 * Mọi bước idempotent: chạy lại không tạo trùng và tự vá nhóm dở dang (thiếu kênh mặc định).
 */
export async function ensureWorkspace(dir: Directory, spec: WorkspaceSpec, now: Date): Promise<WorkspaceCtx> {
  const ownerId = dir.id(spec.owner);
  const normalizedName = normalizeSearch(spec.name);
  let ws = await prisma.workspace.findFirst({ where: { ownerId, normalizedName } });
  let isNew = false;

  if (!ws) {
    isNew = true;
    const createdAt = new Date(now.getTime() - (spec.createdDaysAgo ?? 20) * DAY_MS);
    ws = await prisma.workspace.create({
      data: {
        name: spec.name,
        normalizedName,
        description: spec.description,
        ownerId,
        coverPreset: spec.cover,
        coverAssetId: null,
        avatarAssetId: null,
        timezone: null,
        joinPolicy: spec.joinPolicy ?? "OPEN",
        memberCount: 1,
        lastActivityAt: createdAt,
        createdAt,
      },
    });
    await prisma.workspaceMembership.create({
      data: { workspaceId: ws.id, userId: ownerId, role: "OWNER", ...activeFields(null, createdAt) },
    });
  } else {
    // Nhóm có sẵn: chỉ điền chỗ trống (mô tả, màu bìa), không ghi đè gì người dùng đã đặt.
    const patch: { description?: string; coverPreset?: string; joinPolicy?: "OPEN" | "APPROVAL" } = {};
    if (!ws.description) patch.description = spec.description;
    if (!ws.coverPreset) patch.coverPreset = spec.cover;
    if (spec.joinPolicy && ws.joinPolicy !== spec.joinPolicy) patch.joinPolicy = spec.joinPolicy;
    if (Object.keys(patch).length > 0) ws = await prisma.workspace.update({ where: { id: ws.id }, data: patch });
  }

  let defaultChannelId = ws.defaultChannelId;
  if (!defaultChannelId) {
    const channel = await prisma.channel.create({
      data: {
        workspaceId: ws.id,
        name: "Chung",
        normalizedName: normalizeSearch("Chung"),
        type: "TEXT",
        visibility: "PUBLIC",
        postingPolicy: "MEMBERS",
        isDefault: true,
        memberCount: 1,
        createdBy: ownerId,
        createdAt: ws.createdAt,
      },
    });
    await prisma.channelMembership.create({ data: { channelId: channel.id, workspaceId: ws.id, userId: ownerId, joinedAt: ws.createdAt } });
    await prisma.counter.create({ data: { key: `ch:${channel.id}`, seq: 0 } });
    await prisma.workspace.update({ where: { id: ws.id }, data: { defaultChannelId: channel.id } });
    defaultChannelId = channel.id;
  }

  const ctx: WorkspaceCtx = { spec, id: ws.id, ownerId, createdAt: ws.createdAt, defaultChannelId, isNew, roles: new Map() };
  await addMembers(dir, ctx, now);
  await addPending(dir, ctx, now);
  await addInvitations(dir, ctx, now);
  return ctx;
}

/** Trường dùng chung cho một membership ACTIVE — cùng bộ trường `MemberAddService.addInTx` ghi (null tường minh cho field sau này lọc). */
function activeFields(invitedBy: string | null, joinedAt: Date) {
  return {
    status: "ACTIVE" as const,
    joinedAt,
    leftAt: null,
    leftReason: null,
    removedBy: null,
    banReason: null,
    expiresAt: null,
    expiryVersion: 0,
    invitedBy,
    requestMessage: null,
    requestedAt: null,
    decidedBy: invitedBy,
    decidedAt: invitedBy ? joinedAt : null,
  };
}

async function addMembers(dir: Directory, ctx: WorkspaceCtx, now: Date): Promise<void> {
  const { spec } = ctx;
  const plan: Array<[PersonKey, Role]> = [
    [spec.owner, "OWNER"],
    ...spec.admins.map((k): [PersonKey, Role] => [k, "ADMIN"]),
    ...spec.members.map((k): [PersonKey, Role] => [k, "MEMBER"]),
  ];
  const life = Math.max(now.getTime() - ctx.createdAt.getTime(), DAY_MS);

  for (const [key, role] of plan) {
    const userId = dir.id(key);
    const existing = await prisma.workspaceMembership.findUnique({ where: { workspaceId_userId: { workspaceId: ctx.id, userId } } });
    if (existing) {
      if (existing.status === "ACTIVE") ctx.roles.set(key, existing.role === "GUEST" ? "MEMBER" : (existing.role as Role));
      continue;
    }
    const rng = rngFrom(`join:${spec.key}:${key}`);
    // Quản trị viên vào sớm (trong 15% đầu vòng đời nhóm), thành viên rải đều đến 85%.
    const frac = role === "ADMIN" ? rng() * 0.15 : 0.05 + rng() * 0.8;
    const joinedAt = new Date(ctx.createdAt.getTime() + Math.floor(life * frac));
    await prisma.workspaceMembership.create({
      data: { workspaceId: ctx.id, userId, role, ...activeFields(ctx.ownerId, joinedAt) },
    });
    ctx.roles.set(key, role);
  }
  // Chủ nhóm luôn có trong bảng vai trò (nhóm có sẵn đã có membership OWNER).
  ctx.roles.set(spec.owner, "OWNER");

  // Mọi thành viên ACTIVE tham gia kênh mặc định (như `ChannelBootstrap.joinDefault`).
  for (const key of ctx.roles.keys()) {
    const userId = dir.id(key);
    const joined = await prisma.channelMembership.findUnique({ where: { channelId_userId: { channelId: ctx.defaultChannelId, userId } } });
    if (!joined) {
      await prisma.channelMembership.create({ data: { channelId: ctx.defaultChannelId, workspaceId: ctx.id, userId } });
    }
  }
  await refreshCounts(ctx);
}

/** Đồng bộ `memberCount` của nhóm và kênh mặc định với số membership thật. */
export async function refreshCounts(ctx: WorkspaceCtx): Promise<void> {
  const [members, followers] = await Promise.all([
    prisma.workspaceMembership.count({ where: { workspaceId: ctx.id, status: "ACTIVE" } }),
    prisma.channelMembership.count({ where: { channelId: ctx.defaultChannelId } }),
  ]);
  await prisma.workspace.update({ where: { id: ctx.id }, data: { memberCount: members } });
  await prisma.channel.update({ where: { id: ctx.defaultChannelId }, data: { memberCount: followers } });
}

/** Yêu cầu xin vào nhóm (joinPolicy APPROVAL) — kèm một link mời đã được dùng để gửi yêu cầu. */
async function addPending(dir: Directory, ctx: WorkspaceCtx, now: Date): Promise<void> {
  const pending = ctx.spec.pending ?? [];
  if (pending.length === 0) return;

  const tokenPrefix = `seed${ctx.spec.key}`.slice(0, 6);
  const tokenHash = createHash("sha256").update(`seed-rich:${ctx.id}`).digest("hex");
  const link =
    (await prisma.inviteLink.findUnique({ where: { tokenHash } })) ??
    (await prisma.inviteLink.create({
      data: {
        workspaceId: ctx.id,
        tokenHash,
        tokenPrefix,
        role: "MEMBER",
        maxUses: 20,
        remainingUses: 20 - pending.length,
        usesCount: pending.length,
        expiresAt: new Date(now.getTime() + 6 * DAY_MS),
        revokedAt: null,
        revokedBy: null,
        createdBy: ctx.ownerId,
        lastUsedAt: new Date(now.getTime() - 3_600_000),
      },
    }));

  let i = 0;
  for (const [key, message] of pending) {
    i += 1;
    const userId = dir.id(key);
    const existing = await prisma.workspaceMembership.findUnique({ where: { workspaceId_userId: { workspaceId: ctx.id, userId } } });
    if (existing) continue;
    const requestedAt = new Date(now.getTime() - i * 5 * 3_600_000);
    await prisma.workspaceMembership.create({
      data: {
        workspaceId: ctx.id,
        userId,
        role: "MEMBER",
        status: "PENDING",
        joinedAt: requestedAt,
        requestedAt,
        requestMessage: message,
        invitedBy: ctx.ownerId,
        inviteLinkId: link.id,
        leftAt: null,
        leftReason: null,
        removedBy: null,
        banReason: null,
        decidedBy: null,
        decidedAt: null,
      },
    });
  }
}

/** Lời mời đích danh qua email, chưa ai chấp nhận (token chỉ lưu SHA-256, người dùng không có token gốc nên không bấm nhận được — chỉ để hiển thị danh sách). */
async function addInvitations(dir: Directory, ctx: WorkspaceCtx, now: Date): Promise<void> {
  void dir;
  for (const inv of ctx.spec.invitations ?? []) {
    const normalizedEmail = normalizeEmail(inv.email);
    const pendingKey = `${ctx.id}:${normalizedEmail}`;
    if (await prisma.workspaceInvitation.findUnique({ where: { pendingKey } })) continue;
    const sentAt = new Date(now.getTime() - 2 * DAY_MS);
    await prisma.workspaceInvitation.create({
      data: {
        workspaceId: ctx.id,
        email: inv.email,
        normalizedEmail,
        role: "MEMBER",
        guestChannelIds: [],
        guestDays: null,
        message: inv.message ?? null,
        tokenHash: createHash("sha256").update(randomBytes(32)).digest("hex"),
        invitedBy: ctx.ownerId,
        status: "PENDING",
        pendingKey,
        expiresAt: new Date(sentAt.getTime() + 7 * DAY_MS),
        lastSentAt: sentAt,
        sendCount: 1,
        acceptedBy: null,
        acceptedAt: null,
        revokedBy: null,
        revokedAt: null,
        createdAt: sentAt,
      },
    });
  }
}
