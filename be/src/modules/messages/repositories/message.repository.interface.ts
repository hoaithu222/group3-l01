import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  DeleteModeValue,
  Message,
  MessageAttachment,
  MessageLink,
  MessageMention,
  MessageScopeTypeValue,
  MessageSourceRef,
  ReactionSummary,
  ReplyPreview,
} from "../entities/message.interface";

/**
 * Mọi thao tác GHI của `Message` PHẢI chạy trong transaction (seq/AssetLink/
 * outbox cùng lúc — be.md §5.1 bước 8), nên repository nhận thẳng
 * `Prisma.TransactionClient` cho các method ghi (giống ngoại lệ đã xác nhận
 * của `AssetLinkService`, `.claude/rules/architecture.md` "Shared module
 * services"). Method ĐỌC nhận `PrismaClient | Prisma.TransactionClient` (mặc
 * định singleton `prisma`) để dùng được cả ngoài lẫn trong transaction (vd
 * đọc `replyTo`/kiểm `around` anchor).
 */
export type PrismaOrTx = PrismaClient | Prisma.TransactionClient;

export interface MessageCreateInput {
  scopeType: MessageScopeTypeValue;
  scopeId: string;
  workspaceId: string | null;
  threadId: string | null;
  threadKey: string;
  seq: number;
  authorId: string | null;
  kind: "USER" | "SYSTEM" | "POLL";
  systemType?: string | null;
  systemPayload?: Record<string, unknown> | null;
  clientMessageId: string | null;
  dedupeKey: string;
  content: string | null;
  normalizedContent: string | null;
  mentions: MessageMention[];
  attachments: MessageAttachment[];
  links: MessageLink[];
  replyToId?: string | null;
  replyPreview?: ReplyPreview | null;
  forwardedFrom?: Message["forwardedFrom"];
}

export interface MessageEditData {
  content: string;
  normalizedContent: string;
  mentions: MessageMention[];
  links: MessageLink[];
}

export interface ListBySeqParams {
  scopeType: MessageScopeTypeValue;
  scopeId: string;
  threadKey: string;
  /** `seq > seqAbove` (exclusive). */
  seqAbove?: number;
  /** `seq < seqBelow` (exclusive). */
  seqBelow?: number;
  limit: number;
  order: "asc" | "desc";
}

export interface IMessageRepository {
  findById(id: string, client?: PrismaOrTx): Promise<Message | null>;
  findByIds(ids: string[], client?: PrismaOrTx): Promise<Message[]>;
  findByDedupeKey(dedupeKey: string, client?: PrismaOrTx): Promise<Message | null>;
  listBySeq(params: ListBySeqParams, client?: PrismaOrTx): Promise<Message[]>;
  listPinned(scopeType: MessageScopeTypeValue, scopeId: string, client?: PrismaOrTx): Promise<Message[]>;
  countPinned(scopeType: MessageScopeTypeValue, scopeId: string, client?: PrismaOrTx): Promise<number>;

  /** `Counter` `$inc` nguyên tử theo khoá `msg:<scopeType>:<scopeId>:<threadKey>` (be.md §2/§5.1 bước 8.1). */
  nextSeq(tx: Prisma.TransactionClient, scopeType: MessageScopeTypeValue, scopeId: string, threadKey: string): Promise<number>;

  create(tx: Prisma.TransactionClient, input: MessageCreateInput): Promise<Message>;

  /** `updateMany({id, version: expectedVersion})` — `count=0` → version lệch (be.md §5.3). */
  updateForEdit(
    tx: Prisma.TransactionClient,
    id: string,
    expectedVersion: number,
    data: MessageEditData
  ): Promise<{ count: number; editedAt: Date; version: number }>;

  /** Tombstone dùng chung cho tác giả thu hồi VÀ moderation (be.md §5.4, `deleteMode` phân biệt). */
  tombstone(
    tx: Prisma.TransactionClient,
    id: string,
    actorId: string,
    mode: DeleteModeValue,
    reason: string | null,
    authorOnly: boolean
  ): Promise<{ count: number; deletedAt: Date }>;

  markReplyPreviewsDeleted(tx: Prisma.TransactionClient, replyToId: string): Promise<void>;

  setPin(tx: Prisma.TransactionClient, id: string, pinnedBy: string): Promise<{ count: number; pinnedAt: Date }>;
  clearPin(tx: Prisma.TransactionClient, id: string): Promise<{ count: number }>;
  clearPinIfSet(tx: Prisma.TransactionClient, id: string): Promise<void>;

  updateReactionsSummary(tx: Prisma.TransactionClient, id: string, summary: ReactionSummary[]): Promise<void>;

  /** Cập nhật `linkPreview` (job [P1], không dùng ở vòng p1-04 này — giữ chữ ký cho tương lai). */
  updateLinkPreview(tx: Prisma.TransactionClient, id: string, linkPreview: Message["linkPreview"]): Promise<void>;

  /**
   * (p2-06) Ghi lại `systemPayload` của tin HỆ THỐNG đã đăng (thẻ biên bản công bố lại, thẻ họp "đã kết thúc") — `version + 1`. `null` khi không phải
   * tin hệ thống hoặc đã bị gỡ (tombstone).
   */
  updateSystemPayload(tx: Prisma.TransactionClient, id: string, payload: Record<string, unknown>): Promise<{ version: number } | null>;

  /**
   * (p7-04) Thêm tham chiếu "đã chuyển thành thẻ/tài liệu" vào `Message.sourceRefs` — khử trùng theo `(kind, refId)` NGUYÊN TỬ (lọc `none` ở chính lệnh ghi), trần `MESSAGE_SOURCE_REFS_MAX`
   * (kiểm trước khi ghi — vượt trần hiếm nên chấp nhận cửa sổ đua rất hẹp). Không đổi `version` (không phải sửa nội dung). `NOT_FOUND` khi tin không tồn tại.
   */
  addSourceRef(id: string, ref: MessageSourceRef): Promise<"ADDED" | "EXISTS" | "FULL" | "NOT_FOUND">;
}
