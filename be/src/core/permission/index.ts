// ── Kiểu (be.md §3) ──────────────────────────────────────────────────────────
export type { ScopeType, ScopeRef, ResolvedAccess, ResolveContext, ScopeResolver } from "./scope.types";
export { ACTIONS, GUEST_HIDDEN_ACTIONS, type Action } from "./actions";

// ── Registry (module Phase 1+ đăng ký resolver khi import routes) ───────────
export { registerScopeResolver, getResolver, clearScopeRegistry } from "./scope-registry";

// ── Service (điểm vào chính) ──────────────────────────────────────────────────
export { permissionService, type PermissionService } from "./permission.service";
export { incrVersion } from "./permission.cache";
export { revokeScope, registerRevokeListener, clearRevokeListeners, type RevokeInput, type RevokeListener } from "./revoke-scope";
export { buildMyPermissions } from "./my-permissions";

// ── Ports (infrastructure cài đặt lúc bootstrap) ─────────────────────────────
export {
  setPermissionPorts,
  getPermissionPorts,
  resetPermissionPorts,
  type RealtimePort,
  type OutboxPort,
  type PermissionPorts,
} from "./ports";

// ── Middlewares ───────────────────────────────────────────────────────────────
export {
  requireScope,
  requireWorkspaceRole,
  requireChannelAccess,
  requireConversationMember,
  requireConversationRole,
  requireMeetingRole,
  requireCallParticipant,
  type WorkspaceRoleName,
  type ChannelAccessLevel,
  type ConversationRoleName,
} from "./middlewares";

// ── p1-05 — ConversationHooks port + helper cross-cutting `sharesActiveWorkspace` ──
export {
  registerConversationHooks,
  getConversationHooks,
  resetConversationHooks,
  type ConversationHooks,
  type EnsureMeetingConversationInput,
  type SyncMeetingAttendeesInput,
} from "./conversation-hooks.port";
export { sharesActiveWorkspace, invalidateSharesActiveWorkspaceCache } from "./shares-workspace";
// p3-04 — nhắn 1-1 với KHÁCH: chỉ khi cùng kênh chỉ định / nhóm chat.
export { guestDirectAllowed } from "./guest-scope";

// ── p1-06 — IMentionValidator/IThreadHook port cho message.service.ts (p1-04) ──
export {
  registerMentionValidator,
  getMentionValidator,
  resetMentionValidator,
  registerThreadHook,
  getThreadHook,
  resetThreadHook,
  type IMentionValidator,
  type MentionHookScopeType,
  type MentionHookType,
  type MentionHookInputRef,
  type MentionHookValidatedItem,
  type MentionValidateInput,
  type MentionValidateResult,
  type IThreadHook,
  type ThreadHookRootRef,
  type AssertThreadableInput,
  type ThreadHookReplyRef,
  type OnReplyCreatedResult,
  type ThreadSummaryRef,
} from "./message-hooks.port";

// ── p1-07 — IReadReceiptPublisher (impl: conversations) / IReadStateReader (impl: read-state) ──
export {
  registerReadReceiptPublisher,
  getReadReceiptPublisher,
  resetReadReceiptPublisher,
  registerReadStateReader,
  getReadStateReader,
  resetReadStateReader,
  type IReadReceiptPublisher,
  type IReadStateReader,
} from "./read-state.ports";

// ── p0-01 (đã có, giữ nguyên style — không đụng) ─────────────────────────────
export { getUserStatusCached, invalidateUserStatusCache } from "./user-status";
export { verifyAccessContext, type AccessContext } from "./access-context";
export {
  registerOwnershipGuard,
  assertCanDeleteAccount,
  type OwnershipGuard,
} from "./ownership-guard";

// ── p6-05 — quyền THEO DỮ LIỆU (`partner:*`, sau này `recruiter:*`) do module sở hữu dữ liệu đăng ký provider ──
export {
  registerDataPermissionProvider,
  clearDataPermissionProviders,
  hasDataPermissionProviderFor,
  resolveDataPermissions,
  invalidateDataPermissions,
  withDataPermissions,
  type DataPermissionProvider,
} from "./data-permissions";
