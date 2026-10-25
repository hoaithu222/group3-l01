import { LIMITS } from "../../../core/constants/limits";
import type { ThreadSummaryRef } from "../../../core/permission";
import type { MessagePollView } from "../../../shared/ports/message-poll-reader.port";
import type { MessageScopeCapabilities } from "../scope/message-scope.interface";
import { isUserAuthoredKind, type Message, type MessagePermissions, type MessageView } from "../entities/message.interface";

export interface ProjectionContext {
  viewerId: string;
  /** Tập `"<messageId>:<emoji>"` mà viewer đã react — tính 1 lần cho cả trang (be.md §5.2). */
  myReactionKeys: Set<string>;
  capabilities: MessageScopeCapabilities;
  now?: Date;
  /** p1-06 — tóm tắt thread theo id TIN GỐC, nạp 1 lần/trang (`thread-summary.loader.ts`). Vắng = không ghép. */
  threadSummaries?: ReadonlyMap<string, ThreadSummaryRef>;
  /** p1-04/p1-09 — id tin viewer đã lưu, nạp 1 lần/trang (`saved-flag.loader.ts`). Vắng = không ghép `isSaved`. */
  savedMessageIds?: ReadonlySet<string>;
  /** p7-04 — khảo sát theo id TIN, nạp 1 lần/trang (`poll-view.loader.ts`). Vắng = không ghép `poll`. */
  polls?: ReadonlyMap<string, MessagePollView>;
}

/**
 * `myPermissions` theo ma trận be.md §2/§4 — kết hợp năng lực scope (không đổi theo tin) với trạng thái CỦA từng tin (tác giả/đã xoá/cửa sổ sửa).
 * Tin khảo sát (`POLL`, p7-04) là tin của người dùng: tác giả thu hồi/báo cáo/kiểm duyệt như tin thường, nhưng KHÔNG sửa nội dung (câu hỏi/lựa chọn cố định sau khi có phiếu) và không chuyển tiếp.
 */
function computePermissions(message: Message, ctx: ProjectionContext, deleted: boolean): MessagePermissions {
  const userAuthored = isUserAuthoredKind(message.kind);
  const isAuthor = userAuthored && message.authorId !== null && message.authorId === ctx.viewerId;
  const now = ctx.now ?? new Date();
  const withinEditWindow =
    !deleted && (now.getTime() - message.createdAt.getTime()) / 1000 <= LIMITS.message.editWindowSeconds;

  return {
    canEdit: isAuthor && message.kind === "USER" && !deleted && ctx.capabilities.canWrite && withinEditWindow,
    canRecall: isAuthor && !deleted,
    canPin: ctx.capabilities.canPin && !deleted,
    canReact: ctx.capabilities.canReact && !deleted,
    canReply: ctx.capabilities.canWrite && !deleted,
    canForward: !deleted && message.kind === "USER",
    canReport: !deleted && userAuthored && !isAuthor,
    canModerate: ctx.capabilities.canModerate && !deleted && userAuthored,
  };
}

/**
 * `toView()` — be.md §4 `MessageView`. Tombstone (`deletedAt != null`): rỗng
 * `content/attachments/mentions/links/reactions/linkPreview`, giữ
 * `id/seq/replyToId` để trả lời/thread không hỏng (be.md §2 "Thu hồi").
 * `clientMessageId` chỉ trả cho chính tác giả (be.md §4).
 */
export function toView(message: Message, ctx: ProjectionContext): MessageView {
  const deleted = message.deletedAt !== null;
  const isAuthor = message.authorId !== null && message.authorId === ctx.viewerId;
  // Tóm tắt thread giữ NGUYÊN cả khi tin gốc đã thu hồi (MSG-35: "Tombstone vẫn
  // mở thread, replyCount giữ 4") — khác content/mentions/... bị rỗng khi deleted.
  const thread = ctx.threadSummaries?.get(message.id);

  const reactions = deleted
    ? []
    : message.reactionsSummary.map((r) => ({
        emoji: r.emoji,
        count: r.count,
        me: ctx.myReactionKeys.has(`${message.id}:${r.emoji}`),
      }));

  return {
    id: message.id,
    scopeType: message.scopeType,
    scopeId: message.scopeId,
    threadId: message.threadId,
    seq: message.seq,
    kind: message.kind,
    systemType: message.systemType,
    systemPayload: message.systemPayload,
    authorId: message.authorId,
    clientMessageId: isAuthor ? message.clientMessageId : null,
    content: deleted ? null : message.content,
    mentions: deleted ? [] : message.mentions,
    attachments: deleted ? [] : message.attachments,
    links: deleted ? [] : message.links,
    linkPreview: deleted ? null : message.linkPreview,
    replyToId: message.replyToId,
    replyPreview: message.replyPreview,
    forwardedFrom: message.forwardedFrom,
    reactions,
    pinnedAt: message.pinnedAt,
    pinnedBy: message.pinnedBy,
    editedAt: message.editedAt,
    version: message.version,
    createdAt: message.createdAt,
    deleted,
    deletedAt: message.deletedAt,
    ...(thread && {
      threadRecordId: thread.threadId,
      replyCount: thread.replyCount,
      lastReplyAt: thread.lastReplyAt,
      lastReplierIds: thread.lastReplierIds,
      lastReplySeq: thread.lastReplySeq,
    }),
    ...(ctx.savedMessageIds && { isSaved: !deleted && ctx.savedMessageIds.has(message.id) }),
    // Khảo sát của tin đã thu hồi không còn hiển thị (câu hỏi nằm ở `Poll`, không bị tombstone xoá) — chỉ ghép khi tin còn.
    ...(!deleted && ctx.polls?.has(message.id) && { poll: ctx.polls.get(message.id) }),
    ...(message.sourceRefs.length > 0 && !deleted && {
      sourceRefs: message.sourceRefs.map((s) => ({ kind: s.kind, refId: s.refId, createdAt: s.createdAt })),
    }),
    myPermissions: computePermissions(message, ctx, deleted),
  };
}

/**
 * Payload broadcast `message:created` (be.md §6) — `MessageView` NHƯNG
 * không có `myPermissions`/`reactions[].me` (không có 1 viewer cụ thể khi
 * phát tới cả room) + luôn kèm `clientMessageId`/`authorId` (khác REST vốn
 * chỉ trả `clientMessageId` cho tác giả — ở đây mọi client tự lọc theo
 * `authorId === myUserId` để merge optimistic bubble, be.md §3.1).
 */
export function toBroadcastView(message: Message): Omit<MessageView, "myPermissions" | "reactions"> & {
  reactions: { emoji: string; count: number }[];
} {
  const deleted = message.deletedAt !== null;
  return {
    id: message.id,
    scopeType: message.scopeType,
    scopeId: message.scopeId,
    threadId: message.threadId,
    seq: message.seq,
    kind: message.kind,
    systemType: message.systemType,
    systemPayload: message.systemPayload,
    authorId: message.authorId,
    clientMessageId: message.clientMessageId,
    content: deleted ? null : message.content,
    mentions: deleted ? [] : message.mentions,
    attachments: deleted ? [] : message.attachments,
    links: deleted ? [] : message.links,
    linkPreview: deleted ? null : message.linkPreview,
    replyToId: message.replyToId,
    replyPreview: message.replyPreview,
    forwardedFrom: message.forwardedFrom,
    reactions: deleted ? [] : message.reactionsSummary.map((r) => ({ emoji: r.emoji, count: r.count })),
    pinnedAt: message.pinnedAt,
    pinnedBy: message.pinnedBy,
    editedAt: message.editedAt,
    version: message.version,
    createdAt: message.createdAt,
    deleted,
    deletedAt: message.deletedAt,
  };
}

/** Rút gọn nội dung cho các payload không cần toàn văn (be.md §6 "preview do adapter tạo") — dùng bởi adapter CONVERSATION tương lai; xuất ở đây để tái sử dụng, không bắt buộc CHANNEL dùng (không có preview). */
export function excerptOf(message: Message, maxGraphemes = 80): string {
  if (message.kind === "SYSTEM") return "";
  if (message.content && message.content.trim() !== "") {
    // Khảo sát (p7-04): `content` là câu hỏi — xem trước "[Khảo sát] <câu hỏi>" để người xem biết đó không phải tin thường.
    const text = message.kind === "POLL" ? `[Khảo sát] ${message.content}` : message.content;
    const seg = new Intl.Segmenter("vi", { granularity: "grapheme" });
    const graphemes = Array.from(seg.segment(text)).map((s) => s.segment);
    return graphemes.length > maxGraphemes ? graphemes.slice(0, maxGraphemes).join("") + "…" : text;
  }
  const first = message.attachments[0];
  if (!first) return "";
  switch (first.kind) {
    case "IMAGE":
      return "[Ảnh]";
    case "VIDEO":
      return "[Video]";
    case "VOICE":
      return "[Tin nhắn thoại]";
    case "AUDIO":
      return "[Âm thanh]";
    default:
      return `[Tệp] ${first.name}`;
  }
}
