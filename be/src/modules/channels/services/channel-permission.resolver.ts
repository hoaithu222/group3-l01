import { prisma } from "../../../infrastructure/database";
import { redis } from "../../../infrastructure/redis";
import { registerScopeResolver, type ResolvedAccess } from "../../../core/permission";
import type { Action } from "../../../core/permission";
import { ROOM } from "../../../infrastructure/socket";
import { rolesCovering } from "../../../core/constants/role-coverage";
import type { IChannelRepository } from "../repositories/channel.repository.interface";
import type { IChannelGrantRepository } from "../repositories/channel-grant.repository.interface";
import type { ChannelStatusValue, ChannelVisibilityValue, PostingPolicyValue } from "../entities/channel.interface";

const META_CACHE_TTL_SECONDS = 60;

interface ChannelMeta {
  id: string;
  workspaceId: string;
  visibility: ChannelVisibilityValue;
  status: ChannelStatusValue;
  postingPolicy: PostingPolicyValue;
}

function metaCacheKey(channelId: string): string {
  return `channel:meta:${channelId}`;
}

/** Xoá cache "channel:meta:<id>" khi kênh đổi (be.md §5.5) — gọi từ `channel.service.ts`/`channel-lifecycle.service.ts` sau mỗi lần ghi `Channel`. */
export async function invalidateChannelMetaCache(channelId: string): Promise<void> {
  try {
    await redis.del(metaCacheKey(channelId));
  } catch {
    // best-effort — cache tự hết hạn sau TTL, không chặn nghiệp vụ chính
  }
}

async function loadChannelMeta(repo: IChannelRepository, channelId: string): Promise<ChannelMeta | null> {
  const key = metaCacheKey(channelId);
  try {
    const cached = await redis.get<ChannelMeta>(key);
    if (cached) return cached;
  } catch {
    // fail-open — bỏ qua cache, đọc DB trực tiếp
  }

  const channel = await repo.findById(channelId);
  if (!channel) return null;

  const meta: ChannelMeta = {
    id: channel.id,
    workspaceId: channel.workspaceId,
    visibility: channel.visibility,
    status: channel.status,
    postingPolicy: channel.postingPolicy,
  };
  try {
    await redis.set(key, meta, META_CACHE_TTL_SECONDS);
  } catch {
    // best-effort
  }
  return meta;
}

export interface ChannelActionsInput {
  isPrivate: boolean;
  manage: boolean;
  writable: boolean;
  postingPolicy: PostingPolicyValue;
}

/**
 * Tập action theo be.md §5.5 `evaluate()` — tách riêng để `channel.service.ts#create()`
 * dựng `ResolvedAccess` tổng hợp ngay sau khi tạo kênh (không round-trip qua
 * cache quyền), giống `computeWorkspaceActions` của `workspace-permission.resolver.ts`.
 */
export function computeChannelActions(input: ChannelActionsInput): Set<Action> {
  const actions = new Set<Action>(["channel.read"]);
  if (input.writable) {
    if (input.postingPolicy !== "ADMINS_ONLY" || input.manage) actions.add("channel.message.send");
    // ADMINS_ONLY vẫn cho react — be.md §5.5 (implementation §11.1)
    actions.add("channel.message.react");
  }
  if (input.manage) {
    actions.add("channel.message.pin");
    actions.add("channel.message.moderate");
    actions.add("channel.manage");
    actions.add("channel.grant.manage");
  }
  return actions;
}

/**
 * Đăng ký resolver `CHANNEL` cho `PermissionService` (be.md §5.5) — gọi 1 lần
 * lúc wiring DI trong `channels.routes.ts` (cần instance repo cụ thể), giống
 * `registerWorkspacePermissionResolver`. Đọc trạng thái WORKSPACE qua
 * `ctx.resolve(user, {type:"WORKSPACE",...})` (đi qua cache/dedupe chung của
 * `PermissionService`) — KHÔNG import repository của module `workspaces`
 * (luật 3 tầng). Trạng thái ARCHIVED/ACTIVE của workspace không nằm trong
 * `ResolvedAccess` (chỉ có role/actions/visible) nên đọc trực tiếp
 * `prisma.workspace` — Workspace là model Prisma dùng chung, đọc thẳng qua
 * Prisma (không qua service/repo của module khác) là ngoại lệ đã xác nhận
 * (giống `invite.service.ts` p1-02).
 */
export function registerChannelPermissionResolver(
  channelRepo: IChannelRepository,
  grantRepo: IChannelGrantRepository
): void {
  registerScopeResolver({
    type: "CHANNEL",
    async resolve(user, channelId, ctx): Promise<ResolvedAccess> {
      const meta = await loadChannelMeta(channelRepo, channelId);
      if (!meta) return { visible: false, role: null, actions: new Set() };

      const wsAccess = await ctx.resolve(user, { type: "WORKSPACE", id: meta.workspaceId });
      if (!wsAccess.visible) return { visible: false, role: null, actions: new Set() };

      const isPrivate = meta.visibility === "PRIVATE";
      // p3-04 §5.1 — KHÁCH chỉ đọc kênh có grant DIRECT cho chính họ ("kênh chỉ định"), KỂ CẢ kênh PUBLIC (không nhận "public = mọi
      // thành viên" và không nhận grant theo vai trò).
      const isGuest = wsAccess.role === "GUEST";
      const needsGrant = isPrivate || isGuest;
      // Grant hiệu lực = DIRECT của chính user ∪ ROLE phủ tới vai trò workspace của họ (p3-04 §5.2; GUEST → chỉ DIRECT).
      const grants = needsGrant ? await grantRepo.forUser(channelId, user.id, rolesCovering(wsAccess.role)) : [];
      const canRead = needsGrant ? grants.length > 0 : true;
      if (!canRead) return { visible: false, role: null, actions: new Set() };

      // `manage` chỉ từ grant DIRECT MANAGER — role grant luôn là MEMBER (README §2 "Manager qua vai trò").
      const isManager = grants.some((g) => g.level === "MANAGER" && g.source === "DIRECT");
      const manage = isPrivate ? isManager : wsAccess.role === "OWNER" || wsAccess.role === "ADMIN";

      const workspace = await prisma.workspace.findUnique({
        where: { id: meta.workspaceId },
        select: { status: true },
      });
      const writable = meta.status === "ACTIVE" && workspace?.status === "ACTIVE";
      const actions = computeChannelActions({ isPrivate, manage, writable, postingPolicy: meta.postingPolicy });

      const role = isPrivate ? (isManager ? "MANAGER" : "MEMBER") : manage ? "ADMIN" : "MEMBER";

      return {
        visible: true,
        role,
        actions,
        parent: { type: "WORKSPACE", id: meta.workspaceId },
        // Bump WORKSPACE (archive/restore/role đổi) tự vô hiệu cache mọi CHANNEL
        // con — không cần INCR từng kênh (`permission.cache.ts` `versionDeps`).
        versionDeps: [{ type: "WORKSPACE", id: meta.workspaceId }],
        // Khách hết hạn → cache quyền kênh cũng hết hiệu lực đúng lúc (kế thừa từ WORKSPACE cha).
        ...(wsAccess.expiresAt && { expiresAt: wsAccess.expiresAt }),
      };
    },
    roomsFor(scopeId) {
      return [ROOM.channel(scopeId)];
    },
  });
}
