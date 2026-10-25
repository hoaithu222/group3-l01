import type { MessagePollView } from "../../../shared/ports/message-poll-reader.port";

/**
 * Khai ĐỘC LẬP với Prisma enum/model (cùng giá trị) — module không import
 * chéo kiểu Prisma thẳng vào tầng domain (`.claude/rules/architecture.md`),
 * giống `modules/channels/entities`.
 */
export const MESSAGE_SCOPE_TYPES = ["CHANNEL", "CONVERSATION"] as const;
export type MessageScopeTypeValue = (typeof MESSAGE_SCOPE_TYPES)[number];

/** `POLL` (p7-04): tin khảo sát — tin của NGƯỜI DÙNG (có reaction/reply/thu hồi như tin thường), phần khảo sát ở model `Poll` của `chat-extensions`. */
export const MESSAGE_KINDS = ["USER", "SYSTEM", "POLL"] as const;
export type MessageKindValue = (typeof MESSAGE_KINDS)[number];

/** Tin do người dùng viết (không phải tin hệ thống) — `USER` hoặc `POLL`. Dùng thay `kind === "USER"` ở chỗ khảo sát cũng phải được đối xử như tin thường (thu hồi, báo cáo, kiểm duyệt). */
export const isUserAuthoredKind = (kind: MessageKindValue): boolean => kind !== "SYSTEM";

export const SYSTEM_MESSAGE_TYPES = [
  "CONVERSATION_CREATED",
  "MEMBER_JOINED",
  "MEMBER_LEFT",
  "MEMBER_ADDED",
  "MEMBER_REMOVED",
  "ROLE_CHANGED",
  "OWNER_TRANSFERRED",
  "TITLE_CHANGED",
  "AVATAR_CHANGED",
  "MESSAGE_PINNED",
  "CALL_SUMMARY",
  "MEETING_REMINDER",
  "MEETING_STARTED",
  "MEETING_RECAP",
  "MEETING_RECORDING_READY",
  "INTEGRATION",
  "CONVERSATION_DISSOLVED",
  "WALLET_REMINDER",
  /** p6-03 — cố vấn (khách có hạn) vào / rời nhóm chat cố vấn của một đợt cố vấn. */
  "MENTOR_JOINED",
  "MENTOR_LEFT",
] as const;
export type SystemMessageTypeValue = (typeof SYSTEM_MESSAGE_TYPES)[number];

export const ATTACHMENT_KINDS = ["IMAGE", "VIDEO", "AUDIO", "VOICE", "FILE"] as const;
export type AttachmentKindValue = (typeof ATTACHMENT_KINDS)[number];

export const MENTION_TYPES = ["USER", "ROLE", "ALL"] as const;
export type MentionTypeValue = (typeof MENTION_TYPES)[number];

export const DELETE_MODES = ["AUTHOR_RECALL", "MODERATION"] as const;
export type DeleteModeValue = (typeof DELETE_MODES)[number];

export interface MessageMention {
  type: MentionTypeValue;
  targetId: string | null;
  label: string | null;
}

export interface MessageAttachment {
  assetId: string;
  kind: AttachmentKindValue;
  name: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  waveform: number[];
  thumbnailAssetId: string | null;
}

export interface MessageLink {
  url: string;
  host: string;
}

export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  siteName: string | null;
  imageAssetId: string | null;
  fetchedAt: Date;
}

export interface ReplyPreview {
  authorId: string | null;
  excerpt: string;
  kind: string;
  deleted: boolean;
}

export interface ForwardedFrom {
  messageId: string;
  scopeType: MessageScopeTypeValue;
  authorId: string | null;
  createdAt: Date;
}

export interface ReactionSummary {
  emoji: string;
  count: number;
}

/** p7-04 — tin đã được chuyển thành thẻ/tài liệu (`Message.sourceRefs`). */
export interface MessageSourceRef {
  kind: "TASK" | "RESOURCE";
  refId: string;
  createdBy: string;
  createdAt: Date;
}

/** Tối đa số tham chiếu nguồn trên một tin (chống phình tài liệu khi bấm "tạo thẻ" lặp). */
export const MESSAGE_SOURCE_REFS_MAX = 20;

/** Entity domain — khớp model Prisma `Message` (be.md §2). */
export interface Message {
  id: string;
  scopeType: MessageScopeTypeValue;
  scopeId: string;
  workspaceId: string | null;
  threadId: string | null;
  threadKey: string;
  seq: number;
  authorId: string | null;
  kind: MessageKindValue;
  systemType: SystemMessageTypeValue | null;
  systemPayload: Record<string, unknown> | null;
  clientMessageId: string | null;
  dedupeKey: string;
  content: string | null;
  normalizedContent: string | null;
  mentions: MessageMention[];
  attachments: MessageAttachment[];
  links: MessageLink[];
  linkPreview: LinkPreview | null;
  replyToId: string | null;
  replyPreview: ReplyPreview | null;
  forwardedFrom: ForwardedFrom | null;
  reactionsSummary: ReactionSummary[];
  /** p7-04 — thẻ/tài liệu đã tạo từ tin này; tài liệu cũ chưa có trường → mảng rỗng. */
  sourceRefs: MessageSourceRef[];
  pinnedAt: Date | null;
  pinnedBy: string | null;
  editedAt: Date | null;
  version: number;
  deletedAt: Date | null;
  deletedBy: string | null;
  deleteReason: string | null;
  deleteMode: DeleteModeValue | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessagePermissions {
  canEdit: boolean;
  canRecall: boolean;
  canPin: boolean;
  canReact: boolean;
  canReply: boolean;
  canForward: boolean;
  canReport: boolean;
  canModerate: boolean;
}

export interface MessageReactionView {
  emoji: string;
  count: number;
  me: boolean;
}

/** Projection cho người xem (be.md §4) — `toView()` ở `message-projection.ts` sinh ra. */
export interface MessageView {
  id: string;
  scopeType: MessageScopeTypeValue;
  scopeId: string;
  threadId: string | null;
  seq: number;
  kind: MessageKindValue;
  systemType: SystemMessageTypeValue | null;
  systemPayload: Record<string, unknown> | null;
  authorId: string | null;
  /** Chỉ trả cho chính tác giả (be.md §4). */
  clientMessageId: string | null;
  content: string | null;
  mentions: MessageMention[];
  attachments: MessageAttachment[];
  links: MessageLink[];
  linkPreview: LinkPreview | null;
  replyToId: string | null;
  replyPreview: ReplyPreview | null;
  forwardedFrom: ForwardedFrom | null;
  reactions: MessageReactionView[];
  pinnedAt: Date | null;
  pinnedBy: string | null;
  editedAt: Date | null;
  version: number;
  createdAt: Date;
  deleted: boolean;
  deletedAt: Date | null;
  /**
   * p1-06 tóm tắt thread — CHỈ có ở tin gốc (`threadId=null`, `kind=USER`) của
   * kênh ĐÃ có thread (kể cả tin gốc đã thu hồi — MSG-35); ghép bằng
   * `IThreadHook.summaries()` (1 truy vấn batch/trang, xem `thread-summary.loader.ts`).
   * VẮNG MẶT (không có key) = chưa có reply, hoặc không phải tin gốc ở kênh, hoặc
   * module threads chưa đăng ký. Client render `ThreadSummaryRow` khi `replyCount > 0`.
   */
  /**
   * p1-06 #4 — `Thread.id` (KHÔNG phải id tin gốc; khác `threadId` ở trên vốn là id tin gốc của reply) —
   * khoá của `/me/unread` luồng và `PUT /threads/:id/subscription`. Có mặt cùng lúc với `replyCount`.
   */
  threadRecordId?: string;
  replyCount?: number;
  lastReplyAt?: Date | null;
  /** ≤ 3 userId, người trả lời mới nhất trước. */
  lastReplierIds?: string[];
  /** `seq` luồng thread của reply cuối — client bỏ `thread:updated` có `lastReplySeq` ≤ giá trị này. */
  lastReplySeq?: number;
  /**
   * p1-04/p1-09 — NGƯỜI XEM đã lưu tin này chưa (nhãn "Lưu"/"Bỏ lưu" của menu tin). Nạp 1 truy vấn batch/trang (`saved-flag.loader.ts`).
   * VẮNG MẶT (không có key) = chưa biết (module `discovery` chưa đăng ký cổng, hoặc truy vấn lỗi) — client tự theo dõi qua `saved:updated`;
   * khi có mặt luôn là boolean cho MỌI tin của trang (tin hệ thống/đã thu hồi → `false`).
   */
  isSaved?: boolean;
  /**
   * p7-04 — khảo sát của tin `kind=POLL` (câu hỏi, lựa chọn + đếm, `myOptionIds` của NGƯỜI XEM, `canClose`, `canViewVoters`); ghép 1 truy vấn batch/trang qua cổng
   * `MessagePollReader` (`poll-view.loader.ts`). VẮNG MẶT = không phải khảo sát, tin đã thu hồi, hoặc module chưa đăng ký cổng. Khảo sát ẩn danh không bao giờ lộ người bầu.
   */
  poll?: MessagePollView;
  /** p7-04 — tin đã được chuyển thành thẻ/tài liệu (chỉ có khi có ít nhất một tham chiếu); người mở thẻ/tài liệu vẫn phải có quyền riêng ở đích. */
  sourceRefs?: { kind: "TASK" | "RESOURCE"; refId: string; createdAt: Date }[];
  myPermissions: MessagePermissions;
}

export interface MessageReactorEntry {
  userId: string;
  emoji: string;
  createdAt: Date;
}
