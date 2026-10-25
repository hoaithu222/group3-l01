import { prisma } from "../../../infrastructure/database";
import { redis } from "../../../infrastructure/redis";
import { registerScopeResolver, requireScope, type ResolvedAccess, type Action } from "../../../core/permission";
import { ROOM } from "../../../infrastructure/socket";
import { checkDirectEligibility } from "../services/eligibility.service";
import type { ConversationKindValue, ConversationSettings } from "../entities/conversation.interface";

const META_CACHE_TTL_SECONDS = 60;

const RANK: Record<"OWNER" | "ADMIN" | "MEMBER", number> = { MEMBER: 1, ADMIN: 2, OWNER: 3 };

interface ConversationMeta {
  id: string;
  kind: ConversationKindValue;
  status: "ACTIVE" | "ARCHIVED" | "DISSOLVED";
  workspaceId: string | null;
  settings: ConversationSettings;
}

function metaCacheKey(conversationId: string): string {
  return `conversation:meta:${conversationId}`;
}

/** Xoá cache "conversation:meta:<id>" khi hội thoại đổi (kind luôn cố định nên chỉ status/settings/workspaceId đổi thực sự cần) — gọi từ services sau mỗi lần ghi `Conversation`. Mirror `channel-permission.resolver.ts#invalidateChannelMetaCache`. */
export async function invalidateConversationMetaCache(conversationId: string): Promise<void> {
  try {
    await redis.del(metaCacheKey(conversationId));
  } catch {
    // best-effort — cache tự hết hạn sau TTL
  }
}

export async function loadConversationMeta(conversationId: string): Promise<ConversationMeta | null> {
  const key = metaCacheKey(conversationId);
  try {
    const cached = await redis.get<ConversationMeta>(key);
    if (cached) return cached;
  } catch {
    // fail-open — bỏ qua cache, đọc DB trực tiếp
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, kind: true, status: true, workspaceId: true, settings: true },
  });
  if (!conversation) return null;

  const meta: ConversationMeta = {
    id: conversation.id,
    kind: conversation.kind,
    status: conversation.status,
    workspaceId: conversation.workspaceId,
    settings: conversation.settings as unknown as ConversationSettings,
  };
  try {
    await redis.set(key, meta, META_CACHE_TTL_SECONDS);
  } catch {
    // best-effort
  }
  return meta;
}

const MEMBERS_CACHE_TTL_SECONDS = 60;

function membersCacheKey(conversationId: string): string {
  return `conv:members:${conversationId}`;
}

/** Xoá cache `conv:members:<id>` (be.md §5.7 `resolveAudience`) khi thành viên đổi (add/remove/leave/transfer). */
export async function invalidateConversationMembersCache(conversationId: string): Promise<void> {
  try {
    await redis.del(membersCacheKey(conversationId));
  } catch {
    // best-effort
  }
}

/** userIds của mọi `ConversationMember` ACTIVE — dùng bởi `emitActivity`/`readerIds` (message-scope adapter). Cache Redis 60s (be.md §5.7). */
export async function listActiveMemberIds(conversationId: string): Promise<string[]> {
  const key = membersCacheKey(conversationId);
  try {
    const cached = await redis.get<string[]>(key);
    if (cached) return cached;
  } catch {
    // fail-open
  }

  const rows = await prisma.conversationMember.findMany({
    where: { conversationId, status: "ACTIVE" },
    select: { userId: true },
  });
  const ids = rows.map((r) => r.userId);
  try {
    await redis.set(key, ids, MEMBERS_CACHE_TTL_SECONDS);
  } catch {
    // best-effort
  }
  return ids;
}

/**
 * Đăng ký resolver `CONVERSATION` cho `PermissionService` (item 1 "critical
 * facts" của tác vụ p1-05 — mirror `channel-permission.resolver.ts`). Tính
 * `ResolvedAccess.actions` bằng các tên hành động THẬT đã có sẵn trong
 * `ACTIONS.CONVERSATION` (`core/permission/actions.ts`) — KHÔNG cần action
 * "manage"/"owner"/"addMembers" tổng quát như nhãn `C(action)` trong be.md
 * §4 (nhãn đó chỉ là cách gọi tắt trong tài liệu, không phải action thật):
 *
 *   - "read"/"readIncludingDissolved" → CÙNG action `conversation.read`
 *     (canRead bỏ qua `Conversation.status` hoàn toàn — be.md §5.7 "member
 *     ACTIVE (bất kể conversation status)" — 2 nhãn của be.md collapse về 1).
 *   - "manage" (be.md dùng cho CẢ đổi tên nhóm LẪN xoá thành viên) → 2 action
 *     thật riêng `conversation.update`/`conversation.member.remove`, cùng
 *     điều kiện rank ≥ ADMIN nên tương đương be.md.
 *   - "owner" (dissolve/đổi vai trò/chuyển chủ) → 3 action thật
 *     `conversation.dissolve`/`conversation.member.role`/`conversation.transfer`,
 *     cùng điều kiện rank === OWNER.
 *   - "addMembers" → `conversation.member.add`.
 *
 * `requireConversation()` dưới đây nhận thẳng action thật thay vì nhãn — mỗi
 * route trong `conversations.routes.ts` truyền đúng 1 action, tương đương
 * be.md nhưng tường minh hơn (không cần bảng tra nhãn→action ở nơi khác).
 */
export function registerConversationPermissionResolver(): void {
  registerScopeResolver({
    type: "CONVERSATION",
    async resolve(user, conversationId): Promise<ResolvedAccess> {
      const member = await prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId: user.id } },
      });
      if (!member || member.status !== "ACTIVE") return { visible: false, role: null, actions: new Set() };

      const meta = await loadConversationMeta(conversationId);
      if (!meta) return { visible: false, role: null, actions: new Set() };

      const actions = new Set<Action>(["conversation.read"]);

      let canMessage = false;
      if (meta.status === "ACTIVE") {
        if (meta.kind === "GROUP") {
          canMessage = true;
        } else if (member.peerUserId) {
          const eligibility = await checkDirectEligibility(user.id, member.peerUserId);
          canMessage = eligibility.canMessage;
        }
      }
      if (canMessage) {
        actions.add("conversation.message.send");
        actions.add("conversation.call.start");
      }

      const rank = RANK[member.role];
      const canPin = canMessage && (meta.kind === "DIRECT" || rank >= RANK.ADMIN || meta.settings.memberCanPin);
      if (canPin) actions.add("conversation.message.pin");

      if (meta.kind === "GROUP") {
        if (rank >= RANK.ADMIN) {
          actions.add("conversation.update");
          actions.add("conversation.member.remove");
        }
        if (rank >= RANK.ADMIN || (rank === RANK.MEMBER && meta.settings.membersCanAdd)) {
          actions.add("conversation.member.add");
        }
        if (rank === RANK.OWNER) {
          actions.add("conversation.dissolve");
          actions.add("conversation.member.role");
          actions.add("conversation.transfer");
        }
      }

      const access: ResolvedAccess = { visible: true, role: member.role, actions };
      if (meta.workspaceId) {
        access.parent = { type: "WORKSPACE", id: meta.workspaceId };
        // Bump WORKSPACE (archive/restore/member removed) tự vô hiệu cache mọi
        // GROUP con — DIRECT (workspaceId null) không có dep, dựa vào TTL 60s.
        access.versionDeps = [{ type: "WORKSPACE", id: meta.workspaceId }];
      }
      return access;
    },
    roomsFor(scopeId) {
      return [ROOM.conversation(scopeId)];
    },
  });
}

/** be.md §1/§4 `requireConversation(action)` = `C(action)` — action THẬT (xem docstring trên), `param` mặc định `"id"` (mọi route `:id`). */
export function requireConversation(action: Action, param = "id") {
  return requireScope("CONVERSATION", param, action);
}
