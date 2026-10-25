/**
 * Kiểu DTO khớp `be/src/modules/conversations/entities/conversation.interface.ts`
 * + `dtos/*.ts` (đọc TRỰC TIẾP từ đó — be.md §3/§4 chỉ để tra nhanh, cùng quy
 * ước `chat.types.ts`). Ngày tháng là chuỗi ISO qua JSON, không phải `Date`.
 */

export type ConversationKind = 'DIRECT' | 'GROUP';
export type ConversationStatus = 'ACTIVE' | 'ARCHIVED' | 'DISSOLVED';
export type ConversationRole = 'OWNER' | 'ADMIN' | 'MEMBER';
export type ConversationMemberStatus = 'ACTIVE' | 'LEFT' | 'REMOVED';
export type ConversationNotifyMode = 'INHERIT' | 'ALL' | 'MENTIONS' | 'MUTED';
export type ReadOnlyReason = 'NO_SHARED_WORKSPACE' | 'BLOCKED' | 'DISSOLVED' | 'ARCHIVED';

export interface ConversationSettings {
  membersCanAdd: boolean;
  memberCanPin: boolean;
  mentionAllRole: 'ADMIN' | 'MEMBER';
}

export interface ConversationListItemPeer {
  userId: string;
  name: string;
  avatarUrl: string | null;
  presence: string;
}

export interface ConversationListItemLastMessage {
  id: string;
  seq: number;
  authorId: string | null;
  authorName: string | null;
  kind: 'USER' | 'SYSTEM';
  systemType: string | null;
  /** Payload tin hệ thống (`CALL_SUMMARY`…) — server không excerpt được chữ cho tin hệ thống nên client dựng câu từ đây. */
  systemPayload?: Record<string, unknown> | null;
  preview: string;
  attachmentKind: string | null;
  deleted: boolean;
  createdAt: string;
}

/** be.md §4 — `ConversationListItem`. */
export interface ConversationListItem {
  id: string;
  kind: ConversationKind;
  status: ConversationStatus;
  workspaceId: string | null;
  title: string | null;
  avatarUrl: string | null;
  peer: ConversationListItemPeer | null;
  memberCount: number;
  lastMessage: ConversationListItemLastMessage | null;
  unreadCount: number;
  hasMention: boolean;
  markedUnread: boolean;
  pinnedAt: string | null;
  archivedAt: string | null;
  muted: boolean;
  notifyMode: ConversationNotifyMode;
  readOnly: boolean;
  readOnlyReason: ReadOnlyReason | null;
  activityAt: string;
  isMeetingGroup: boolean;
}

export interface ConversationMyPermissions {
  canSend: boolean;
  canCall: boolean;
  canRename: boolean;
  canAddMembers: boolean;
  canRemoveMembers: boolean;
  canChangeRoles: boolean;
  canTransfer: boolean;
  canLeave: boolean;
  canDissolve: boolean;
  canPin: boolean;
  canMentionAll: boolean;
}

/** be.md §4 — `ConversationDetail` = `ConversationListItem` + chi tiết. */
export interface ConversationDetail extends ConversationListItem {
  settings: ConversationSettings;
  myRole: ConversationRole;
  lastReadSeq: number;
  hiddenBeforeSeq: number;
  ownerId: string | null;
  meetingId: string | null;
  peerLastReadSeq: number | null;
  peerReadAt: string | null;
  myPermissions: ConversationMyPermissions;
  version: number;
}

/** be.md §4 — `PATCH .../me` / `POST .../clear`. */
export interface MyConversationState {
  conversationId: string;
  pinnedAt: string | null;
  archivedAt: string | null;
  markedUnread: boolean;
  notifyMode: ConversationNotifyMode;
  mutedUntil: string | null;
  hiddenBeforeSeq: number;
  lastReadSeq: number;
}

export type ConversationFilter = 'all' | 'unread' | 'direct' | 'group' | 'pinned' | 'archived';

export interface ListConversationsParams {
  filter: ConversationFilter;
  q?: string;
  workspaceId?: string;
  cursor?: string;
  limit?: number;
}

export interface CursorMeta {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}
export interface ConversationsPage {
  data: ConversationListItem[];
  meta: CursorMeta;
}

/** be.md §4 — `GET /conversations/people`. */
export interface PersonOption {
  userId: string;
  name: string;
  avatarUrl: string | null;
  presence: string;
  sharedWorkspaceIds: string[];
  directConversationId?: string;
}

export interface DirectEligibility {
  canMessage: boolean;
  reason: 'NO_SHARED_WORKSPACE' | 'BLOCKED' | 'SELF' | null;
}

export interface CreateGroupPayload {
  workspaceId: string;
  title: string;
  memberIds: string[];
  avatarAssetId?: string;
}

export interface PatchConversationPayload {
  title?: string;
  avatarAssetId?: string | null;
  settings?: Partial<ConversationSettings>;
  expectedVersion: number;
}

export interface DissolveResult {
  id: string;
  status: 'DISSOLVED';
  dissolvedAt: string;
}

export interface MemberListItem {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: ConversationRole;
  joinedAt: string;
  presence: string;
}
export interface MembersPage {
  data: MemberListItem[];
  meta: CursorMeta;
}

export type AddMemberSkipReason = 'ALREADY_MEMBER' | 'NOT_WORKSPACE_MEMBER' | 'BLOCKED';
export interface AddMembersPayload {
  userIds: string[];
  role?: 'MEMBER' | 'ADMIN';
}
export interface AddMembersResult {
  added: string[];
  skipped: { userId: string; reason: AddMemberSkipReason }[];
}

export interface ChangeRoleResult {
  userId: string;
  role: ConversationRole;
  status: ConversationMemberStatus;
}
export interface RemoveMemberResult {
  userId: string;
  status: 'REMOVED';
}
export interface LeaveResult {
  status: 'LEFT';
  conversationStatus: ConversationStatus;
}

export type MediaKind = 'MEDIA' | 'FILE' | 'LINK';
export interface MediaAttachment {
  assetId: string;
  kind: string;
  name: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  thumbnailAssetId: string | null;
}
export interface MediaLink {
  url: string;
  host: string;
}
export interface MediaItem {
  messageId: string;
  seq: number;
  authorId: string | null;
  createdAt: string;
  attachment?: MediaAttachment;
  link?: MediaLink;
}
export interface MediaPage {
  data: MediaItem[];
  meta: CursorMeta;
}

export interface ReadReceiptEntry {
  userId: string;
  name: string;
  avatarUrl: string | null;
  readAt: string;
}
export interface ReadReceiptsResult {
  readers: ReadReceiptEntry[];
  total: number;
  hiddenByPrivacy?: boolean;
}

export interface MeSettingsPayload {
  pinned?: boolean;
  notifyMode?: ConversationNotifyMode;
  mutedUntil?: string | null;
  archived?: boolean;
  markedUnread?: boolean;
}

/** Đủ dữ liệu cho `CreateGroupScreen` bước 1 — gọi thẳng `/workspaces` (be.md p1-01), không import feature `workspaces` (`feature-structure.md`). */
export interface WorkspaceOption {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/** Gửi tin ĐẦU của `DraftDirectScreen` qua alias `/conversations/:id/messages` (be.md §4) — xem `conversations.service.ts`. */
export interface SendFirstMessagePayload {
  clientMessageId: string;
  content: string;
}
export interface SentMessageResult {
  id: string;
  seq: number;
  createdAt: string;
}
