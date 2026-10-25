import type { Prisma } from "@prisma/client";
import type { AuthUser } from "../../../core/types/express";
import type { MentionTypeValue, MessageKindValue, MessageScopeTypeValue } from "../entities/message.interface";

/**
 * Hợp đồng adapter mà `messages` (p1-04) ĐỊNH NGHĨA cho từng loại
 * `MessageScopeType` (be.md p1-03 §5.6: "Interface do p1-04 định nghĩa").
 * Engine (`message.service.ts`, `message-interaction.service.ts`,
 * `message-forward.service.ts`) CHỈ gọi qua `registry.get(scopeType)` — không
 * bao giờ import `modules/channels`/`modules/conversations` trực tiếp.
 *
 * Tên phương thức ở đây là bản CHỐT (be.md p1-03 §5.6: "nếu tên phương thức
 * lệch, p1-04 thắng") — CHANNEL adapter (`modules/channels/services/
 * channel-message-scope.adapter.ts`) triển khai đúng các tên này, không phải
 * bản phác thảo `load/can/...` ở be.md p1-03 §5.6.
 */

export interface MessageScopeReadAccess {
  /** `false` → scope không tồn tại hoặc user không thấy được → 404 trung tính. */
  visible: boolean;
  workspaceId: string | null;
}

export interface MessageScopeWriteAccess extends MessageScopeReadAccess {
  /** `visible=true` nhưng `allowed=false` → 403 `MSG_004` (be.md §5.1 bước 1). */
  allowed: boolean;
}

/** Tập năng lực KHÔNG phụ thuộc 1 tin cụ thể — kết hợp với `isAuthor`/`deleted` ở `message-projection.ts` để ra `MessagePermissions` đầy đủ. */
export interface MessageScopeCapabilities {
  canWrite: boolean;
  canReact: boolean;
  canPin: boolean;
  canModerate: boolean;
}

export interface MessageScopeViewerContext {
  /** "Xoá phía tôi" cursor (D-23, hội thoại) — CHANNEL luôn 0 (be.md §5.2). */
  hiddenBeforeSeq: number;
  capabilities: MessageScopeCapabilities;
}

export interface MessageCommittedInfo {
  messageId: string;
  threadKey: string;
  seq: number;
  createdAt: Date;
  /** Người gửi tin (`null` = tin hệ thống). Có mặt ⇒ adapter KHÔNG đọc lại tin trong transaction; vắng ⇒ adapter tự đọc (đường gọi cũ). */
  authorId?: string | null;
  /** Mention của tin — đi cùng `authorId`. */
  mentions?: ReadonlyArray<{ type: string; targetId: string | null }>;
}

export interface MessageActivityMention {
  type: MentionTypeValue;
  targetId: string | null;
}

/** Dữ liệu tối thiểu để adapter tự build + phát `channel:activity`/`conversation:activity` (be.md §6) — CHỈ gọi khi `threadKey === "root"`. */
export interface MessageActivityInfo {
  messageId: string;
  seq: number;
  createdAt: Date;
  kind: MessageKindValue;
  authorId: string | null;
  mentions: MessageActivityMention[];
}

export interface MentionValidationInput {
  type: MentionTypeValue;
  targetId?: string;
}

export interface MentionValidationResult {
  valid: boolean;
  /** Mention không hợp lệ theo dữ liệu thành viên riêng của scope (vd không phải member) — `MSG_008 details.invalidMentions`. */
  invalidMentions?: MentionValidationInput[];
}

export interface MessageScope {
  readonly scopeType: MessageScopeTypeValue;

  /** Dùng cho `GET /messages/:id`, `requireMessageScope("read")`. `!visible` → 404. */
  canRead(user: AuthUser, scopeId: string): Promise<MessageScopeReadAccess>;

  /** Dùng cho gửi tin / `requireMessageScope("write")`. `visible=false` → 404; `visible=true, allowed=false` → 403 `MSG_004`. */
  canWrite(user: AuthUser, scopeId: string): Promise<MessageScopeWriteAccess>;

  /** 1 lần cho cả trang `list()` (be.md §5.2) — hides + `myPermissions` chung của trang. */
  viewerContext(user: AuthUser, scopeId: string): Promise<MessageScopeViewerContext>;

  /** Giới hạn số tin ghim cùng lúc trong scope (kênh 20, hội thoại 10 — be.md §9). */
  pinMax(scopeId: string): number | Promise<number>;

  /** Danh sách userId hiện đọc được scope — dùng bởi adapter để tính audience `*:activity` (be.md §6) và dự phòng cho p1-07. */
  readerIds(scopeId: string): Promise<string[]>;

  /**
   * Cập nhật số liệu phi chuẩn hoá (`lastSeq`/`lastMessageAt`/`lastMessageId`
   * — kênh; `lastSeq`/`lastMessageAt`/`lastMessageId` — hội thoại) TRONG
   * transaction gửi tin (be.md §5.1 bước 8.4). Engine CHỈ gọi khi
   * `info.threadKey === "root"` (tin trả lời trong thread không đẩy "tin mới
   * nhất" của scope — mục 5 báo cáo, thread thật để dành p1-06).
   */
  onMessageCommitted(tx: Prisma.TransactionClient, scopeId: string, info: MessageCommittedInfo): Promise<void>;

  /**
   * Build + phát `channel:activity`/`conversation:activity` tới `user:{id}`
   * từng người có quyền đọc (be.md §6) — adapter tự gọi
   * `emitToUsers`/`emitToRoom` (KHÔNG bao giờ `getIO()` trực tiếp, xem
   * `infrastructure/socket/socket.emit.ts`). Engine chỉ gọi khi tin ở
   * `threadKey === "root"`, SAU khi outbox relay đã claim (không gọi đồng bộ
   * trong request — D-22).
   */
  emitActivity(scopeId: string, info: MessageActivityInfo): Promise<void>;

  /** Room Socket.IO chứa nội dung tin (`ch:{id}`/`conv:{id}`) — outbox handler dùng để `emitToRoom("message:*", ...)`. */
  contentRoom(scopeId: string): string;

  /** `true` nếu tin nhắn scope này được lập chỉ mục tìm kiếm (p1-09) — mặc định coi là `true` khi không cài đặt. */
  searchable?(scopeId: string): boolean;

  /**
   * (Tuỳ chọn) validate mentions bằng dữ liệu thành viên riêng của scope —
   * xem `services/mention-validator.ts` cho phần kiểm cấu trúc chung (mọi
   * scope). CHANNEL cài đặt bằng grant/membership riêng; CONVERSATION
   * (p1-06 thật) có thể cài đặt sau. Không cài → engine chỉ áp dụng kiểm
   * cấu trúc (item 4 báo cáo).
   */
  validateMentions?(scopeId: string, mentions: MentionValidationInput[]): Promise<MentionValidationResult>;
}
