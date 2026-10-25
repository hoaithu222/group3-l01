/**
 * Cổng `modules/conversations` (p6-03) để module KHÁC (`mentor`) tạo nhóm chat GROUP theo mục đích và gỡ một thành viên bởi HỆ THỐNG
 * mà KHÔNG import chéo `modules/conversations` (luật 3 tầng). `modules/conversations/public.ts` export `createConversationPort()`.
 */
export interface CreateGroupConversationInput {
  workspaceId: string;
  title: string;
  /** OWNER nhóm chat — phải là thành viên ACTIVE (không phải khách) của workspace; không còn → người đầu tiên hợp lệ trong `memberIds`. */
  ownerId: string;
  /** Thành viên thường (lọc: ACTIVE, không phải khách). */
  memberIds: string[];
  /** Khách được thêm RÕ RÀNG (lọc: GUEST ACTIVE còn hạn) — có khách thì nhóm bật `allowGuests`. */
  guestIds: string[];
  /** Khoá idempotent của người gọi (vd `mentor:<engagementId>`) — gọi lại cùng khoá trả nhóm đã tạo. */
  dedupeKey: string;
}

export interface CreateGroupConversationResult {
  conversationId: string;
  /** `false` khi nhóm đã tồn tại theo `dedupeKey` (lần gọi lặp). */
  created: boolean;
  /** Thành viên thật sự có mặt (gồm OWNER). */
  memberIds: string[];
}

export interface ConversationPort {
  /** Tạo GROUP (tin hệ thống `CONVERSATION_CREATED` + `MEMBER_ADDED` cho thành viên thường, outbox `conversation.created`). */
  createGroup(input: CreateGroupConversationInput): Promise<CreateGroupConversationResult>;
  /** Gỡ `userId` khỏi GROUP bởi hệ thống (chuyển chủ/giải tán như rời workspace). Không phải thành viên ACTIVE → no-op. */
  removeMember(conversationId: string, userId: string): Promise<void>;
}
