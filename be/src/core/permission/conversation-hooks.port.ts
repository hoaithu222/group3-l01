/**
 * Cổng để module KHÁC (workspaces p1-01/p1-02, meetings p2-04, moderation
 * p1-08, messages p1-04 forward) gọi VÀO module `conversations` (p1-05) mà
 * KHÔNG import trực tiếp (luật 3 tầng, `.claude/rules/architecture.md`) —
 * đặt ở `core/permission` theo đúng be.md p1-05 §1 file tree ("interface
 * ConversationHooks để workspaces/meetings gọi không import module").
 *
 * Registry đơn giản (1 implementation toàn cục) — KHÁC `ports.ts`
 * (RealtimePort/OutboxPort, cần throw nếu chưa bind vì mọi request core đều
 * cần) vì `ConversationHooks` chỉ được gọi bởi các side-effect KHÔNG đồng bộ
 * với boot (job outbox, forward tin nhắn) — `getConversationHooks()` trả
 * `null` khi chưa đăng ký, nơi gọi tự quyết định fallback (xem
 * `message-forward.service.ts` — dùng `MSG_017` làm placeholder khi `null`).
 * `modules/conversations/index.ts#registerConversationModule()` gọi
 * `registerConversationHooks(new ConversationHooksService(...))` lúc
 * `router.ts` import, giống `registerChannelModule()`.
 */

export interface EnsureMeetingConversationInput {
  meetingId: string;
  workspaceId: string;
  title: string;
  hostId: string;
  attendeeIds: string[];
}

export interface SyncMeetingAttendeesInput {
  meetingId: string;
  hostId: string;
  coHostIds: string[];
  attendeeIds: string[];
}

export interface ConversationHooks {
  /**
   * be.md §5.9 — p1-02 gọi qua job `conversations.workspace-member-removed`
   * (outbox `workspace.member-removed`), KHÔNG gọi trực tiếp đồng bộ trong
   * request rời/bị loại workspace.
   */
  onWorkspaceMemberRemoved(workspaceId: string, userId: string): Promise<void>;
  /** be.md §5.9 — GROUP ACTIVE → ARCHIVED (read-only) khi workspace bị lưu trữ. */
  onWorkspaceArchived(workspaceId: string): Promise<void>;
  /** be.md §5.9 — GROUP ARCHIVED (do workspace) → ACTIVE khi workspace phục hồi (không mở lại DISSOLVED). */
  onWorkspaceRestored(workspaceId: string): Promise<void>;
  /** be.md §5.9 — idempotent theo `meetingKey`, gọi bởi p2-04 lúc tạo cuộc họp. */
  ensureMeetingConversation(input: EnsureMeetingConversationInput): Promise<{ conversationId: string }>;
  /** be.md §5.9 — đồng bộ thành viên nhóm chat của cuộc họp, gọi bởi p2-04. */
  syncMeetingAttendees(input: SyncMeetingAttendeesInput): Promise<void>;
  /**
   * (p2-04) Cuộc họp huỷ/xoá → nhóm chat họp thành ARCHIVED (chỉ đọc, KHÔNG giải tán — README §2 "Nhóm chat họp"). Idempotent;
   * không có nhóm chat của cuộc họp → no-op. Tuỳ chọn để bản giả trong test cũ không phải khai.
   */
  archiveMeetingConversation?(meetingId: string): Promise<void>;
  /**
   * be.md §5.2/§5.9 — lấy/tạo hội thoại DIRECT idempotent giữa 2 người. Ném
   * `AppError` 403 `CONV_001`/`CONV_002` (be.md §5.1) khi KHÔNG đủ điều kiện
   * nhắn VÀ chưa có hội thoại sẵn — nơi gọi (`message-forward.service.ts`,
   * p2-01) tự bắt lỗi này giống mọi `AppError` 403 khác.
   */
  getOrCreateDirect(meId: string, otherId: string): Promise<{ conversationId: string }>;
  /** be.md §5.9 — gọi bởi `modules/blocks` (p1-08, `BlocksService`) SAU khi chặn HOẶC bỏ chặn: bump quyền + tính lại `readOnly` của DM và phát `conversation:updated`. */
  onUserBlocked(userIdA: string, userIdB: string): Promise<void>;
}

let impl: ConversationHooks | null = null;

export function registerConversationHooks(hooks: ConversationHooks): void {
  impl = hooks;
}

export function getConversationHooks(): ConversationHooks | null {
  return impl;
}

/** Chỉ dùng trong test để cô lập giữa các case. */
export function resetConversationHooks(): void {
  impl = null;
}
