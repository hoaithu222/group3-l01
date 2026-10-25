/**
 * Kiểu DTO khớp `be/src/modules/messages/entities/message.interface.ts` +
 * `dtos/*.ts` (đọc TRỰC TIẾP từ đó — be.md §3/§4 chỉ để tra nhanh). Ngày tháng
 * là chuỗi ISO qua JSON, không phải `Date` (cùng quy ước `channels.types.ts`).
 */
import type { MessagePollView, MessageSourceRefView } from '@/shared/message-extensions';

export type ChatScopeType = 'CHANNEL' | 'CONVERSATION';

/** Đăng ký scope BẤT KỲ dùng chat engine — khớp `MessageScope` phía BE (be.md §1). */
export interface ChatScopeRef {
  scopeType: ChatScopeType;
  scopeId: string;
  threadId?: string;
}

/** `POLL` (p7-04): tin khảo sát — của người dùng (thu hồi/báo cáo như tin thường) nhưng thân là thẻ khảo sát (`poll`), do `chat-extensions` vẽ qua khe `messageBody`. */
export type MessageKind = 'USER' | 'SYSTEM' | 'POLL';
export type SystemMessageType =
  | 'CONVERSATION_CREATED'
  | 'MEMBER_JOINED'
  | 'MEMBER_LEFT'
  | 'MEMBER_ADDED'
  | 'MEMBER_REMOVED'
  | 'ROLE_CHANGED'
  | 'OWNER_TRANSFERRED'
  | 'TITLE_CHANGED'
  | 'AVATAR_CHANGED'
  | 'MESSAGE_PINNED'
  | 'CALL_SUMMARY'
  | 'MEETING_REMINDER'
  | 'MEETING_STARTED'
  | 'MEETING_RECAP'
  | 'MEETING_RECORDING_READY'
  | 'INTEGRATION'
  /** p6-04 ví nhóm: `systemPayload = { workspaceId, debtorsCount }` — KHÔNG số tiền. Renderer do `wallet` đăng ký (`registerSystemMessageRenderer`). */
  | 'WALLET_REMINDER'
  /** p6-03 cố vấn tham gia nhóm chat: `systemPayload = { mentorId, endsAt (ISO) }`. Renderer do `mentor` đăng ký (`registerSystemMessageRenderer`). */
  | 'MENTOR_JOINED'
  /** p6-03 đợt cố vấn kết thúc: `systemPayload = { mentorId, reason: 'EXPIRED' | 'LEFT' | 'REMOVED' }`. Renderer do `mentor` đăng ký. */
  | 'MENTOR_LEFT';
export type AttachmentKind = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'VOICE' | 'FILE';
export type MentionType = 'USER' | 'ROLE' | 'ALL';
/** Vai trò có thể `@role` trong kênh (p3-04, `GRANT_ROLE_REFS` của BE): `ADMIN` = OWNER + ADMIN, `MEMBER` = OWNER + ADMIN + MEMBER (KHÔNG gồm khách). */
export type MentionRoleRef = 'ADMIN' | 'MEMBER';

export interface MessageMention {
  type: MentionType;
  targetId: string | null;
  label: string | null;
}
export interface MessageAttachment {
  assetId: string;
  kind: AttachmentKind;
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
  fetchedAt: string;
}
export interface ReplyPreview {
  authorId: string | null;
  excerpt: string;
  kind: string;
  deleted: boolean;
}
export interface ForwardedFrom {
  messageId: string;
  scopeType: ChatScopeType;
  authorId: string | null;
  createdAt: string;
}
export interface MessageReactionView {
  emoji: string;
  count: number;
  me: boolean;
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

/** Projection cho người xem (be.md §4) — hình dạng THẬT trả về từ mọi endpoint đọc/ghi tin. */
export interface MessageView {
  id: string;
  scopeType: ChatScopeType;
  scopeId: string;
  threadId: string | null;
  seq: number;
  kind: MessageKind;
  systemType: SystemMessageType | null;
  systemPayload: Record<string, unknown> | null;
  authorId: string | null;
  /** Chỉ có giá trị cho chính tác giả (be.md §4) — dùng để khớp bản tạm outbox. */
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
  pinnedAt: string | null;
  pinnedBy: string | null;
  editedAt: string | null;
  version: number;
  createdAt: string;
  deleted: boolean;
  deletedAt: string | null;
  /**
   * `Thread.id` (p1-06 #4) — KHÔNG phải id tin gốc; `threadId` ở trên đã mang nghĩa khác (id tin gốc
   * của một reply). Khoá của `PUT /threads/:id/subscription` và `/me/unread` luồng. Có mặt cùng lúc với
   * `replyCount`; vắng mặt ở BE cũ ⇒ nơi cần `Thread.id` vẫn lấy từ `GET /messages/:id/thread`.
   */
  threadRecordId?: string;
  /**
   * Tóm tắt luồng (p1-06) — BE CHỈ ghép cho tin GỐC ở kênh ĐÃ có luồng, còn lại
   * VẮNG MẶT (không có key). UI phải chịu được `undefined` (ẩn hàng tóm tắt) chứ
   * không coi là "0 phản hồi". `lastReplySeq` cho phép bỏ `thread:updated` cũ.
   */
  replyCount?: number;
  lastReplyAt?: string | null;
  /** ≤ 3 userId, người trả lời mới nhất trước. */
  lastReplierIds?: string[];
  lastReplySeq?: number;
  /**
   * p7-04 — khảo sát của tin `kind = 'POLL'` (BE chỉ ghép cho tin khảo sát chưa thu hồi; VẮNG MẶT ở mọi tin khác). Tin đến qua socket là bản DÙNG CHUNG
   * (`myOptionIds` rỗng, `canClose`/`canViewVoters` = false) — xem `MessagePollView`.
   */
  poll?: MessagePollView;
  /** p7-04 — tin đã được chuyển thành thẻ công việc/tài liệu (chip "Đã tạo task"); vắng mặt khi chưa lần nào. */
  sourceRefs?: MessageSourceRefView[];
  myPermissions: MessagePermissions;
}

export interface ListMessagesMeta {
  nextBeforeSeq: number | null;
  nextAfterSeq: number | null;
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
  limit: number;
}
export interface MessagesPage {
  data: MessageView[];
  meta: ListMessagesMeta;
  anchorMessageId?: string;
}

export interface SendMessageAttachmentInput {
  assetId: string;
  waveform?: number[];
}
export interface SendMessagePayload {
  clientMessageId: string;
  content?: string;
  attachments?: SendMessageAttachmentInput[];
  mentions?: MessageMention[];
  replyToId?: string;
  threadRootId?: string;
}
export interface EditMessagePayload {
  content: string;
  mentions?: MessageMention[];
  expectedVersion: number;
}

/**
 * Dạng mention gửi LÊN server (`mentionInputSchema` BE): `targetId` phải VẮNG
 * MẶT (không phải `null`) với `@all`, và không có `label` — `null` làm Zod
 * `objectIdSchema.optional()` từ chối cả request bằng `VAL_001`.
 */
export interface MentionInput {
  type: MentionType;
  targetId?: string;
}

/**
 * Một cụm nhắc tên nằm trong TEXT hiển thị của composer (`@Minh`): `text.slice(start, end)`
 * luôn bằng `@${label}`. `userId` chỉ có với `USER`, `roleRef` chỉ có với `ROLE`; `ALL` không có đích. `invalid`
 * = server từ chối đích này (`MSG_008 details.invalidMentions`) — chỉ để tô đỏ. `recipientCount` (chỉ `ROLE`) = số người
 * sẽ nhận theo `GET …/mentionables` LÚC chọn — chỉ để composer nhắc "Sẽ thông báo cho khoảng N người", KHÔNG gửi lên server.
 */
export interface MentionRange {
  start: number;
  end: number;
  type: 'USER' | 'ALL' | 'ROLE';
  userId?: string;
  roleRef?: MentionRoleRef;
  recipientCount?: number;
  label: string;
  invalid?: boolean;
}

/** `GET /scopes/:scopeType/:scopeId/mentionables` — BE KHÔNG trả email (be.md p1-06 §5.5). */
export interface MentionableUser {
  userId: string;
  name: string;
  avatarUrl: string | null;
  roleLabel?: string;
}
/** `@role` (p3-04): một vai trò nhắc được kèm số người sẽ nhận (đọc được kênh, trừ chính mình) — BE `MentionableRole`. */
export interface MentionableRole {
  roleRef: MentionRoleRef;
  label: string;
  recipientCount: number;
}
export interface MentionablesResult {
  users: MentionableUser[];
  canMentionAll: boolean;
  /** Chỉ khi xin `includeRoles=true` ở KÊNH: người gọi có quyền `@role` (`workspace.mention.role` — OWNER/ADMIN) không. */
  canMentionRole?: boolean;
  /** Chỉ khi `canMentionRole` — mỗi vai trò kèm số người nhận. Vắng/rỗng ⇒ picker không có nhóm "Vai trò". */
  roles?: MentionableRole[];
  /** Chỉ có khi `canMentionAll` (nhóm chat) — số người sẽ nhận (`memberCount - 1`). */
  allCount?: number;
}

export type ForwardTarget = { scopeType: ChatScopeType; scopeId: string } | { directUserId: string };
export interface ForwardMessagePayload {
  forwardRequestId: string;
  targets: ForwardTarget[];
  note?: string;
}
export interface ForwardResultItem {
  target: ForwardTarget;
  status: 'SENT' | 'DENIED' | 'FAILED';
  messageId?: string;
  scopeType?: ChatScopeType;
  scopeId?: string;
  code?: string;
}
export interface ForwardResult {
  results: ForwardResultItem[];
}

export interface ReactionResult {
  messageId: string;
  emoji: string;
  count: number;
  me: boolean;
}
export interface PinResult {
  messageId: string;
  pinned: boolean;
  pinnedAt: string | null;
  pinnedBy: string | null;
}
export interface HideResult {
  messageId: string;
  hidden: boolean;
}
export interface ReactorEntry {
  userId: string;
  emoji: string;
  createdAt: string;
}
export interface ReactorPage {
  data: ReactorEntry[];
  cursor: string | null;
}

/**
 * `MessageView.authorId` là userId THUẦN — `messages` (p1-04) không sở hữu tên
 * hiển thị/avatar (đó là dữ liệu của `members`/`workspaces`, và `chat` không
 * được import chéo feature). Màn cha (đã có sẵn danh bạ, vd `useChannelMembers`)
 * truyền một bộ tra qua `ChatRoom.resolveAuthor` — không truyền thì bong bóng
 * hiện tên/avatar TỐI GIẢN (xem `MessageBubble.tsx`).
 */
export interface ChatAuthorInfo {
  name: string;
  avatarUrl?: string | null;
}
export type ResolveChatAuthor = (userId: string) => ChatAuthorInfo | undefined;

/**
 * Đích chuyển tiếp là KÊNH/hội thoại — `ForwardSheet` (app.md §3). `chat` không tự có danh sách
 * chúng: màn cha (đã có sẵn danh bạ kênh, vd `channelsService.search`) truyền qua
 * `ChatRoom.searchForwardTargets` — cùng mẫu `resolveAuthor`. ⚠️ Hình dạng này là HỢP ĐỒNG với các
 * màn cha (`channels`, `conversations` đang dựng `ForwardTargetOption[]`) — đừng đổi thành union.
 */
export interface ForwardTargetOption {
  scopeType: ChatScopeType;
  scopeId: string;
  label: string;
}

/**
 * Đích NGƯỜI (gửi tin riêng — BE `directUserId`, tự tìm/tạo hội thoại DIRECT) do chính
 * `ForwardSheet` tự tìm qua `chatService.searchPeople`; màn cha không phải cấp.
 */
export interface ForwardPersonOption {
  userId: string;
  label: string;
  avatarUrl?: string | null;
}

/** Mọi thứ `ForwardSheet` cho chọn: kênh/hội thoại (màn cha cấp) hoặc người (tự tìm). */
export type ForwardOption = ForwardTargetOption | ForwardPersonOption;

/** `GET /conversations/people` — chỉ những trường `ForwardSheet` dùng (feature khác nhưng cùng endpoint, xem `chat.service.ts`). */
export interface ForwardPerson {
  userId: string;
  name: string;
  avatarUrl: string | null;
}
