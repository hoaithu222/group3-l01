/**
 * Khai ĐỘC LẬP với Prisma enum/model (cùng giá trị) — module không import
 * chéo kiểu Prisma thẳng vào tầng domain (`.claude/rules/architecture.md`),
 * giống `modules/channels/entities`/`modules/messages/entities`.
 */
export const CONVERSATION_KINDS = ["DIRECT", "GROUP"] as const;
export type ConversationKindValue = (typeof CONVERSATION_KINDS)[number];

export const CONVERSATION_STATUSES = ["ACTIVE", "ARCHIVED", "DISSOLVED"] as const;
export type ConversationStatusValue = (typeof CONVERSATION_STATUSES)[number];

export const CONVERSATION_ROLES = ["OWNER", "ADMIN", "MEMBER"] as const;
export type ConversationRoleValue = (typeof CONVERSATION_ROLES)[number];

export const CONVERSATION_MEMBER_STATUSES = ["ACTIVE", "LEFT", "REMOVED"] as const;
export type ConversationMemberStatusValue = (typeof CONVERSATION_MEMBER_STATUSES)[number];

export const CONVERSATION_NOTIFY_MODES = ["INHERIT", "ALL", "MENTIONS", "MUTED"] as const;
export type ConversationNotifyModeValue = (typeof CONVERSATION_NOTIFY_MODES)[number];

export const READ_ONLY_REASONS = ["NO_SHARED_WORKSPACE", "BLOCKED", "DISSOLVED", "ARCHIVED"] as const;
export type ReadOnlyReason = (typeof READ_ONLY_REASONS)[number];

export interface ConversationSettings {
  membersCanAdd: boolean;
  memberCanPin: boolean;
  mentionAllRole: "ADMIN" | "MEMBER";
}

export interface Conversation {
  id: string;
  kind: ConversationKindValue;
  workspaceId: string | null;
  meetingId: string | null;
  meetingKey: string | null;
  directKey: string;
  title: string | null;
  normalizedTitle: string | null;
  avatarAssetId: string | null;
  ownerId: string | null;
  createdBy: string;
  status: ConversationStatusValue;
  settings: ConversationSettings;
  lastSeq: number;
  lastMessageAt: Date | null;
  lastMessageId: string | null;
  activityAt: Date;
  memberCount: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
  dissolvedAt: Date | null;
  dissolvedBy: string | null;
  dissolveReason: string | null;
  /** p3-04 — GROUP: cho phép OWNER/ADMIN nhóm thêm KHÁCH (mặc định tắt, D-16); thêm khách khi tắt → `CONV_015`. */
  allowGuests?: boolean;
}

export interface ConversationMember {
  id: string;
  conversationId: string;
  userId: string;
  kind: ConversationKindValue;
  workspaceId: string | null;
  role: ConversationRoleValue;
  status: ConversationMemberStatusValue;
  peerUserId: string | null;
  joinedAt: Date;
  leftAt: Date | null;
  addedBy: string | null;
  lastReadSeq: number;
  lastReadAt: Date | null;
  unreadCount: number;
  mentionsSinceRead: number;
  notifyMode: ConversationNotifyModeValue;
  mutedUntil: Date | null;
  pinnedAt: Date | null;
  archivedAt: Date | null;
  markedUnread: boolean;
  hiddenBeforeSeq: number;
  activityAt: Date;
  searchText: string;
  version: number;
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
  kind: "USER" | "SYSTEM" | "POLL";
  systemType: string | null;
  /** Payload tin hệ thống (vd `CALL_SUMMARY`: ai gọi, kết quả) — `preview` của tin hệ thống rỗng nên client tự dựng câu theo góc nhìn người xem. */
  systemPayload?: Record<string, unknown> | null;
  preview: string;
  attachmentKind: string | null;
  deleted: boolean;
  createdAt: Date;
}

/** be.md §4 — `ConversationListItem`. */
export interface ConversationListItem {
  id: string;
  kind: ConversationKindValue;
  status: ConversationStatusValue;
  workspaceId: string | null;
  title: string | null;
  avatarUrl: string | null;
  peer: ConversationListItemPeer | null;
  memberCount: number;
  lastMessage: ConversationListItemLastMessage | null;
  unreadCount: number;
  hasMention: boolean;
  markedUnread: boolean;
  pinnedAt: Date | null;
  archivedAt: Date | null;
  muted: boolean;
  notifyMode: ConversationNotifyModeValue;
  readOnly: boolean;
  readOnlyReason: ReadOnlyReason | null;
  activityAt: Date;
  isMeetingGroup: boolean;
}

/** be.md §4 — `ConversationDetail` = `ConversationListItem` + phần chi tiết. */
export interface ConversationDetail extends ConversationListItem {
  settings: ConversationSettings;
  myRole: ConversationRoleValue;
  lastReadSeq: number;
  hiddenBeforeSeq: number;
  ownerId: string | null;
  meetingId: string | null;
  peerLastReadSeq: number | null;
  peerReadAt: Date | null;
  myPermissions: ConversationMyPermissions;
}

/** be.md §4 — `PATCH .../me`/`POST .../clear`. */
export interface MyConversationState {
  conversationId: string;
  pinnedAt: Date | null;
  archivedAt: Date | null;
  markedUnread: boolean;
  notifyMode: ConversationNotifyModeValue;
  mutedUntil: Date | null;
  hiddenBeforeSeq: number;
  lastReadSeq: number;
}
