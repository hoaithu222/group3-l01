import type { AuthUser } from "../../core/types/express";

/**
 * Cổng "kiểm duyệt tin nhắn" (p1-08 be.md §5) — `modules/messages` (p1-04)
 * cài đặt (`createMessageModerationPort()` ở `@modules/messages/public`),
 * `modules/moderation` tiêu thụ. Moderation KHÔNG bao giờ import
 * `modules/messages` nội bộ hay đọc collection `Message` trực tiếp.
 */
export type ModerationScopeType = "CHANNEL" | "CONVERSATION";

/** Nguồn gỡ tin — ghi vào audit (`message.moderator-remove`). */
export type ModerationRemoveSource = "REPORT" | "PLATFORM";

/** Thông tin tối thiểu về 1 tin để phân loại báo cáo / dựng preview (KHÔNG chứa nội dung ngoài `excerpt`). */
export interface ModerationMessageRef {
  id: string;
  scopeType: ModerationScopeType;
  scopeId: string;
  workspaceId: string | null;
  authorId: string | null;
  kind: "USER" | "SYSTEM" | "POLL";
  deleted: boolean;
  /** Rút gọn ≤ 120 ký tự; rỗng nếu tin đã gỡ (nội dung gốc đã xoá khỏi DB khi tombstone). */
  excerpt: string;
  createdAt: Date;
}

export interface ModerationAttachmentSummary {
  kind: string;
  name: string;
  mime: string;
}

/** Tin ±N cho moderator (D-06) — chỉ trả cho luồng đã audit + thông báo. */
export interface MessageForModeration {
  id: string;
  seq: number;
  authorId: string | null;
  kind: "USER" | "SYSTEM" | "POLL";
  /** `null` khi tin đã bị gỡ (tombstone xoá nội dung gốc — không khôi phục được). */
  content: string | null;
  attachments: ModerationAttachmentSummary[];
  createdAt: Date;
  editedAt: Date | null;
  deleted: boolean;
  deletedAt: Date | null;
  /** `true` = đúng tin bị báo cáo (các tin còn lại là ngữ cảnh). */
  isTarget: boolean;
}

export interface RemoveByModeratorInput {
  messageId: string;
  actorId: string;
  actorRole?: string;
  reason: string;
  source: ModerationRemoveSource;
  /** Báo cáo gốc (nếu có) — ghi vào metadata audit. */
  reportId?: string;
}

export interface RemoveByModeratorResult {
  messageId: string;
  deletedAt: Date;
  /** `true` nếu tin đã bị gỡ từ trước (idempotent) — KHÔNG ghi audit lần nữa. */
  alreadyDeleted: boolean;
}

export interface MessageModerationPort {
  /** Tra tin + kiểm `viewer` ĐỌC được phạm vi. `null` nếu không tồn tại HOẶC không đọc được (không phân biệt — 404 trung tính). */
  findReadable(viewer: AuthUser, messageId: string): Promise<ModerationMessageRef | null>;

  /** Tra nhiều tin KHÔNG kiểm quyền — người gọi PHẢI tự lọc bằng `canReadScope` trước khi trả `excerpt`. */
  findByIds(ids: string[]): Promise<ModerationMessageRef[]>;

  canReadScope(viewer: AuthUser, scopeType: ModerationScopeType, scopeId: string): Promise<boolean>;

  /** OWNER/ADMIN kênh public, MANAGER kênh private, OWNER/ADMIN nhóm chat — do adapter phạm vi quyết định. */
  canModerateScope(viewer: AuthUser, scopeType: ModerationScopeType, scopeId: string): Promise<boolean>;

  /** Gỡ tin (tombstone `MODERATION` + audit `message.moderator-remove` + `message:deleted`). Idempotent. */
  removeByModerator(input: RemoveByModeratorInput): Promise<RemoveByModeratorResult>;

  /**
   * Tin bị báo cáo ±`size` theo `seq` cùng scope + luồng (`threadKey`), BỎ QUA kiểm quyền người xem
   * (luồng D-06 / nội dung public đã kiểm quyền ở tầng gọi). `[]` nếu tin không tồn tại.
   */
  contextAround(messageId: string, size: number): Promise<MessageForModeration[]>;
}
