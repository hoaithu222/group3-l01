import type { Prisma } from "@prisma/client";

/**
 * Cổng để `modules/messages` (p1-04, engine tin nhắn CHUNG) gọi VÀO
 * `modules/threads`/`modules/mentions` (p1-06) mà KHÔNG import trực tiếp
 * (luật 3 tầng, `.claude/rules/architecture.md`) — mirror
 * `conversation-hooks.port.ts` (p1-05): registry 1-implementation toàn cục,
 * `get*()` trả `null` khi chưa đăng ký (module p1-06 chưa build/test không
 * boot `router.ts`), nơi gọi (`message.service.ts`) tự fallback — KHÔNG throw.
 *
 * `modules/threads/index.ts`/`modules/mentions/index.ts` gọi
 * `registerThreadHook(...)`/`registerMentionValidator(...)` lúc `router.ts`
 * import, giống `registerConversationHooks()`.
 *
 * Type ở đây CỐ TÌNH tự chứa (không import type từ `modules/messages/entities`)
 * — giữ `core/` độc lập với `modules/`, đúng tinh thần `conversation-hooks.port.ts`.
 */

// ── IMentionValidator (be.md §5.2 `MentionService.validate()`) ─────────────

export type MentionHookScopeType = "CHANNEL" | "CONVERSATION";
export type MentionHookType = "USER" | "ROLE" | "ALL";

export interface MentionHookInputRef {
  type: MentionHookType;
  targetId?: string | null;
}

export interface MentionHookValidatedItem {
  type: MentionHookType;
  targetId: string | null;
  label: string | null;
}

export interface MentionValidateInput {
  scopeType: MentionHookScopeType;
  scopeId: string;
  /** `dto.mentions` (đã qua Zod, chưa xác thực ngữ nghĩa) — thứ tự KHÔNG quan trọng. */
  mentions: MentionHookInputRef[];
  /** Nội dung tin đã chuẩn hoá (`normalizeContent`, TRƯỚC `normalizeSearch`) — dùng để parse marker `@{u:id}`/`@{all}`/`@{r:ROLE}` đối chiếu với `mentions[]` (be.md §5.2 bước 1). */
  content: string;
  actorId: string;
  /** Chỉ khi SỬA tin (p3-04 `@role`): id tin đang sửa — để không tính lại quyền/hạn mức cho vai trò đã có sẵn trên tin. */
  messageId?: string;
}

export interface MentionValidateResult {
  mentions: MentionHookValidatedItem[];
  /** USER id đã resolve, LOẠI TRỪ tự tag chính mình (be.md §5.2 "Tự tag chính mình được giữ trong mentions nhưng loại khỏi mentionUserIds"). */
  mentionUserIds: string[];
  mentionAll: boolean;
  /**
   * Nội dung với marker thay bằng `@label` (be.md §5.1 `MentionParser` —
   * `textForSearch`) — `message.service.ts` dùng thay cho content thô khi
   * tính `normalizedContent` (tìm theo tên lúc gửi thay vì marker `@{u:id}`).
   */
  textForSearch: string;
}

/**
 * Ném `AppError` (400 `MSG_008` biến thể theo `details.reason`, 403 `MSG_020`,
 * 429 `MSG_021`) TRỰC TIẾP khi không hợp lệ — `message.service.ts` KHÔNG kiểm
 * `.valid` như validator cấu trúc cũ, chỉ `await` rồi dùng kết quả (lỗi tự
 * propagate như mọi `AppError` khác trong `send()`/`edit()`).
 */
export interface IMentionValidator {
  validate(input: MentionValidateInput): Promise<MentionValidateResult>;
}

let mentionValidatorImpl: IMentionValidator | null = null;

export function registerMentionValidator(impl: IMentionValidator): void {
  mentionValidatorImpl = impl;
}

export function getMentionValidator(): IMentionValidator | null {
  return mentionValidatorImpl;
}

/** Chỉ dùng trong test để cô lập giữa các case. */
export function resetMentionValidator(): void {
  mentionValidatorImpl = null;
}

// ── IThreadHook (be.md §5.3 `ThreadService`) ────────────────────────────────

export interface ThreadHookRootRef {
  id: string;
  scopeType: MentionHookScopeType;
  scopeId: string;
  authorId: string | null;
  /** `Message.threadId` của CHÍNH root — khác `null` nghĩa là root đang là 1 reply (không cho tạo thread lồng, be.md §5.3 "root là reply → MSG_019"). */
  threadId: string | null;
  deletedAt: Date | null;
  kind: "USER" | "SYSTEM" | "POLL";
}

export interface AssertThreadableInput {
  /** `null` khi không tìm thấy root (`messageRepo.findById` trả null) — hook tự quyết định mã lỗi (`MSG_006`/`MSG_018`/`MSG_019`). */
  root: ThreadHookRootRef | null;
  replyScopeType: MentionHookScopeType;
  replyScopeId: string;
}

export interface ThreadHookReplyRef {
  id: string;
  seq: number;
  createdAt: Date;
  authorId: string | null;
  /** `MessageScopeWriteAccess.workspaceId` đã resolve cho CHANNEL của reply — dùng để ghi `Thread.workspaceId` (bắt buộc trong schema) khi tạo mới. */
  workspaceId: string | null;
}

export interface OnReplyCreatedResult {
  threadId: string;
  isFirstReply: boolean;
  parentAuthorId: string | null;
}

/**
 * Tóm tắt thread của 1 tin gốc — `IThreadHook.summaries()` trả cho engine
 * ghép vào `MessageView` (be.md §4 "p1-04 `MessageView` của tin gốc ở kênh
 * được ghép `replyCount`, `lastReplyAt`, `lastReplierIds`"). Tự chứa (không
 * import `Thread` của `modules/threads`) — cùng nguyên tắc các type ở trên.
 */
export interface ThreadSummaryRef {
  /** `Thread.id` (KHÔNG phải id tin gốc) — dùng cho `PUT /threads/:id/subscription`. */
  threadId: string;
  replyCount: number;
  lastReplyAt: Date | null;
  /** ≤ `LIMITS.thread.lastRepliersMax` (3), người trả lời mới nhất trước. */
  lastReplierIds: string[];
  /** `seq` (luồng thread) của reply cuối — app dùng để bỏ `thread:updated` cũ hơn cache. */
  lastReplySeq: number;
}

export interface IThreadHook {
  /**
   * Tóm tắt thread của NHIỀU tin gốc bằng 1 truy vấn (be.md §4 — KHÔNG N+1):
   * key Map = id TIN GỐC (`Thread.parentMessageId`); tin gốc chưa có thread
   * KHÔNG xuất hiện trong Map. `message.service.ts` gọi 1 lần/trang `list()`
   * (và 1 lần cho `get()`/`edit()`) rồi ghép vào `MessageView`.
   */
  summaries(rootMessageIds: string[]): Promise<Map<string, ThreadSummaryRef>>;

  /**
   * Validate TRƯỚC transaction gửi tin (be.md §5.3 `assertThreadable`) — ném
   * `AppError` (`MSG_006`/`MSG_018`/`MSG_019`) khi vi phạm, không trả gì khi hợp lệ.
   */
  assertThreadable(input: AssertThreadableInput): Promise<void>;

  /**
   * Chạy TRONG transaction gửi reply (be.md §5.3 `onReplyCreated`, SAU khi
   * `Message` đã `create()`) — upsert `Thread`, `ThreadSubscription` tác giả
   * (AUTO_ON nếu chưa có lựa chọn). Trả `{isFirstReply, parentAuthorId}` để
   * `message.service.ts` đưa vào payload outbox `message.created`.
   */
  onReplyCreated(
    tx: Prisma.TransactionClient,
    reply: ThreadHookReplyRef,
    root: ThreadHookRootRef
  ): Promise<OnReplyCreatedResult>;

  /**
   * Gọi từ `message.outbox-handlers.ts` (job `message.events`, SAU commit,
   * be.md §7 "outbox message.created có threadId → emit thread:updated") —
   * hook tự đọc `Thread` + phát `thread:updated` tới room `ch:{channelId}`
   * (KHÔNG trả dữ liệu ra ngoài — `modules/messages` không cần biết cấu trúc
   * `ThreadView`). Tham số là `Message.threadId` (= id TIN GỐC, chính là
   * `Thread.parentMessageId`) — KHÔNG PHẢI `Thread.id`.
   */
  emitThreadUpdated(rootMessageId: string): Promise<void>;
}

let threadHookImpl: IThreadHook | null = null;

export function registerThreadHook(impl: IThreadHook): void {
  threadHookImpl = impl;
}

export function getThreadHook(): IThreadHook | null {
  return threadHookImpl;
}

/** Chỉ dùng trong test để cô lập giữa các case. */
export function resetThreadHook(): void {
  threadHookImpl = null;
}
