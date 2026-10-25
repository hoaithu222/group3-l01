/**
 * Cổng "khảo sát của các tin trong một trang" (p7-04 be.md §1 `message-projection` + `PollView`) — đặt ở `shared/ports/` (giống `SavedMessageReader`) để `modules/messages` ghép
 * `MessageView.poll` cho tin `kind=POLL` MÀ KHÔNG import `modules/chat-extensions` (luật 3 tầng). `chat-extensions` đăng ký bản đọc lúc boot (API: `registerChatExtensionsModule()`; worker: qua
 * `worker-registries.ts`); chưa đăng ký (test cũ, tiến trình không nạp module) → `getMessagePollReader()` trả `null` và `MessageView` bỏ trường `poll`.
 *
 * ⚠ Hợp đồng riêng tư: khảo sát ẩn danh KHÔNG bao giờ trả `userId` người bầu; `myOptionIds` chỉ của chính `viewer.userId` (payload phát cả phòng: `userId = null` ⇒ rỗng).
 */
export interface MessagePollOptionView {
  id: string;
  text: string;
  voteCount: number;
  /** 0–100, làm tròn 1 chữ số; tính trên `voterCount` (chọn nhiều đáp án: tổng có thể > 100). */
  percent: number;
}

export interface MessagePollView {
  id: string;
  messageId: string;
  scopeType: "CHANNEL" | "CONVERSATION";
  scopeId: string;
  question: string;
  multi: boolean;
  anonymous: boolean;
  closesAt: Date | null;
  status: "OPEN" | "CLOSED";
  closeReason: "EXPIRED" | "BY_CREATOR" | "BY_MODERATOR" | "MESSAGE_RECALLED" | null;
  options: MessagePollOptionView[];
  voterCount: number;
  /** Chỉ của người xem (`viewer.userId`); rỗng khi không có người xem cụ thể. */
  myOptionIds: string[];
  canClose: boolean;
  canViewVoters: boolean;
  version: number;
}

export interface MessagePollViewer {
  /** `null` khi dựng payload phát cả phòng (không có người xem cụ thể). */
  userId: string | null;
  /** Năng lực kiểm duyệt của người xem trong phạm vi tin (`MessageScopeCapabilities.canModerate`). */
  canModerate: boolean;
}

export interface MessagePollReader {
  /** MỘT lượt truy vấn khảo sát + MỘT lượt phiếu của người xem cho cả trang; tin không có khảo sát không xuất hiện trong kết quả. */
  pollsOf(viewer: MessagePollViewer, messageIds: readonly string[]): Promise<Map<string, MessagePollView>>;
}

let reader: MessagePollReader | null = null;

/** Gọi lúc boot của module sở hữu khảo sát; đăng ký lại sẽ GHI ĐÈ. */
export function registerMessagePollReader(impl: MessagePollReader): void {
  reader = impl;
}

export function getMessagePollReader(): MessagePollReader | null {
  return reader;
}

/** Chỉ dùng trong test để cô lập giữa các case. */
export function clearMessagePollReader(): void {
  reader = null;
}

/**
 * Job đóng khảo sát khi TIN bị thu hồi/gỡ (queue + tên). `modules/messages` ghi hàng outbox này (cùng transaction thu hồi, chỉ với tin `kind=POLL`);
 * `chat-extensions` đăng ký processor cùng tên — một hằng chung để hai phía không lệch nhau mà không phải import lẫn nhau.
 */
export const POLL_MESSAGE_DELETED_JOB = { queue: "notifications", name: "poll.message-deleted" } as const;
