import type { Prisma } from "@prisma/client";

/**
 * Cổng "gửi/đọc tin THAY người dùng" (p7-04 be.md §5.1, đồng bộ chéo #5) — module KHÁC (`chat-extensions`: khảo sát, tin hẹn giờ, nhắc lại, chuyển tin thành thẻ/tài liệu) tạo và đọc tin
 * mà KHÔNG import `modules/messages` nội bộ và KHÔNG tự ghi collection `Message` (luật 3 tầng, `.claude/rules/architecture.md`). `modules/messages` cài đặt bằng CHÍNH `MessageService.send()`
 * (kiểm quyền ghi, chuẩn hoá, mention, thread, seq, outbox `message.created`/`fanout.message`…) và export factory `createMessageSendPort()` ở `@modules/messages/public` — không nhân bản logic gửi tin.
 *
 * Đặt ở `shared/ports/` (giống các cổng khác: `channel-creation.port`, `member-contact.port`…) thay vì `core/ports/` như bản nháp be.md: `core/` không chứa kiểu của nghiệp vụ.
 *
 * Giới hạn tốc độ (`scopeLimiter("msg")`) nằm ở tầng HTTP nên các lời gọi qua cổng này (job phát tin hẹn giờ) không phải qua nó — không cần cờ `skipRateLimit` như bản nháp.
 */
export type PortScopeType = "CHANNEL" | "CONVERSATION";
export type PortMessageKind = "USER" | "SYSTEM" | "POLL";

/** Mention do NGƯỜI DÙNG khai (chưa giải tên): `USER`/`ALL`/`ROLE` — engine tự kiểm và dựng nhãn lúc gửi. */
export interface PortMention {
  type: "USER" | "ROLE" | "ALL";
  targetId?: string;
}

/** Bản nháp tin cần kiểm TRƯỚC khi hẹn giờ (nội dung, tệp READY của người soạn, mention, tin trả lời cùng phạm vi) — cùng luật với `send()`. */
export interface MessageDraftInput {
  content?: string;
  mentions?: PortMention[];
  attachmentAssetIds?: string[];
  replyToId?: string;
}

/** Bản nháp ĐÃ chuẩn hoá (NFC, gộp dòng trống…) — gửi lại qua `send()` cho kết quả đồng nhất. */
export interface NormalizedDraft {
  content: string | null;
  mentions: PortMention[];
  attachmentAssetIds: string[];
  replyToId: string | null;
}

/** Tin vừa tạo — đủ để bảng phụ (vd `Poll`) ghi CÙNG transaction qua `onCreated`. */
export interface PortCreatedMessage {
  id: string;
  scopeType: PortScopeType;
  scopeId: string;
  workspaceId: string | null;
  threadId: string | null;
  authorId: string | null;
  kind: PortMessageKind;
  createdAt: Date;
}

export interface SendMessageAsInput {
  authorId: string;
  scopeType: PortScopeType;
  scopeId: string;
  /** Chỉ kênh: id TIN GỐC của thread. */
  threadId?: string;
  /** Khoá idempotent cùng `authorId` (`u:<authorId>:<clientMessageId>`) — gửi lại trả tin cũ (`replayed`). Tin hẹn giờ dùng `sched:<id>`. */
  clientMessageId: string;
  /** `POLL`: `content` = câu hỏi (tìm kiếm/xem trước như tin thường). Mặc định `USER`. */
  kind?: "USER" | "POLL";
  content?: string;
  mentions?: PortMention[];
  attachmentAssetIds?: string[];
  replyToId?: string;
  /**
   * Chạy TRONG transaction của bước ghi tin (sau khi `Message` đã tạo, trước khi ghi outbox): nơi ghi `Poll`, hàng outbox hẹn giờ… — ném lỗi ⇒ rollback CẢ tin.
   * Không chạy khi `replayed` (tin đã có từ lần trước).
   */
  onCreated?: (tx: Prisma.TransactionClient, message: PortCreatedMessage) => Promise<void>;
}

/** Phần chung của `MessageView` (bản đầy đủ có thêm reactions/myPermissions/poll… — đối tượng trả về thực tế là `MessageView` của engine). */
export interface PortMessageView {
  id: string;
  scopeType: PortScopeType;
  scopeId: string;
  threadId: string | null;
  seq: number;
  kind: PortMessageKind;
  authorId: string | null;
  content: string | null;
  version: number;
  createdAt: Date;
}

export interface SendMessageAsResult {
  view: PortMessageView;
  /** `true` khi `clientMessageId` đã tạo tin trước đó (không tạo lần hai, `onCreated` KHÔNG chạy). */
  replayed: boolean;
}

/** Quyền của MỘT người với MỘT phạm vi tin: `readable=false` ≡ 404 trung tính; `readable && !allowed` ≡ 403 `MSG_004`. */
export interface PortWriteAccess {
  readable: boolean;
  allowed: boolean;
  workspaceId: string | null;
}

export interface PortAttachment {
  assetId: string;
  kind: "IMAGE" | "VIDEO" | "AUDIO" | "VOICE" | "FILE";
  name: string;
  mime: string;
  size: number;
}

export interface PortSourceRef {
  kind: "TASK" | "RESOURCE";
  refId: string;
  createdBy: string;
  createdAt: Date;
}

/** Tin mà người gọi ĐỌC ĐƯỢC (kể cả tin đã thu hồi — `deletedAt != null`, nội dung/tệp rỗng). */
export interface PortReadableMessage extends PortCreatedMessage {
  content: string | null;
  attachments: PortAttachment[];
  deletedAt: Date | null;
  sourceRefs: PortSourceRef[];
  /** Năng lực của người gọi trong phạm vi tin (theo `MessageScope.viewerContext`). */
  myPermissions: { canModerate: boolean; canWrite: boolean };
}

export interface IMessageSendPort {
  /**
   * Gửi tin THAY `authorId` bằng `MessageService.send()` (đủ mọi bước: quyền ghi hiện tại, nội dung, tệp, mention, thread, idempotency). Lỗi nghiệp vụ của engine
   * (`MSG_001/002/004/005/007/008`, 404) được ném nguyên vẹn để người gọi phân loại. Người gửi không tồn tại/không `ACTIVE` → 404.
   */
  send(input: SendMessageAsInput): Promise<SendMessageAsResult>;
  /** Quyền ghi HIỆN TẠI của `userId` (không ném lỗi). Người không tồn tại/không `ACTIVE` → `{ readable: false, allowed: false }`. */
  canWrite(userId: string, scopeType: PortScopeType, scopeId: string): Promise<PortWriteAccess>;
  /** `null` khi tin không tồn tại HOẶC `userId` không đọc được phạm vi của nó (không phân biệt — trung tính). */
  getReadable(userId: string, messageId: string): Promise<PortReadableMessage | null>;
  /** Kiểm bản nháp (bước chuẩn hoá nội dung, tệp, mention, tin trả lời) MÀ KHÔNG ghi gì. Không kiểm quyền ghi — người gọi đã `canWrite`. */
  validateDraft(userId: string, scopeType: PortScopeType, scopeId: string, draft: MessageDraftInput): Promise<NormalizedDraft>;
  /** Gắn tham chiếu "đã chuyển thành thẻ/tài liệu" vào tin (khử trùng theo `(kind, refId)`, ≤ 20 mục). Idempotent. */
  appendSourceRef(messageId: string, ref: PortSourceRef): Promise<void>;
}
