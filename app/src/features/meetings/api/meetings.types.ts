/**
 * Kiểu DTO của module `meetings` (BE `be/src/modules/meetings/entities/meeting.interface.ts`, p2-04 be.md §5).
 * ⚠️ Khai TAY, khớp MÃ BE thật: `MyMeetingActions` của mã có tên trường khác bảng README §6.2 (`canEditLimited`, `joinVia`,
 * `canManageRoles`, `canLeaveAttendance`, `cancelRequiresReason`…) — mã thắng tài liệu, client chỉ vẽ nút theo cờ server trả.
 */

export type MeetingStatus = 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELLED';
export type MeetingFormat = 'ONLINE' | 'OFFLINE' | 'HYBRID';
export type MeetingPlatform = 'INTERNAL' | 'ZOOM' | 'TEAMS' | 'GOOGLE_MEET' | 'OTHER';
export type MeetingVisibility = 'ATTENDEES' | 'WORKSPACE';
export type MeetingLobbyMode = 'OFF' | 'NON_ATTENDEES' | 'ALL';
export type MeetingNotifyVia = 'APP' | 'CHAT' | 'BOTH';
export type MeetingRsvp = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'TENTATIVE';
export type MeetingAttendeeRole = 'HOST' | 'CO_HOST' | 'ATTENDEE';
export type MeetingEndReason =
  'HOST_ENDED' | 'EMPTY' | 'MAX_DURATION' | 'FORCE_ENDED' | 'WORKSPACE_ARCHIVED' | 'HOST_REMOVED';
export type JoinVia = 'DIRECT' | 'WAIT_FOR_HOST' | 'LOBBY';

export interface MyMeetingActions {
  canCancel: boolean;
  canDelete: boolean;
  canEdit: boolean;
  /** LIVE: chỉ sửa được tiêu đề/agenda/`endAt`/lobby (sửa giờ bắt đầu, nền tảng… bị khoá). */
  canEditLimited: boolean;
  canEditRecap: boolean;
  canEnd: boolean;
  canJoin: boolean;
  canLeaveAttendance: boolean;
  canManageAttendees: boolean;
  canManageRoles: boolean;
  canOpenExternal: boolean;
  canRecord: boolean;
  canRsvp: boolean;
  canStart: boolean;
  canViewRecap: boolean;
  /** OWNER/ADMIN không tham dự huỷ hộ người khác ⇒ BẮT BUỘC lý do (audit `meeting.cancel-by-admin`). */
  cancelRequiresReason: boolean;
  joinVia: JoinVia | null;
}

export interface MeetingListItemDto {
  attendeeCount: number;
  code: string;
  endAt: string;
  format: MeetingFormat;
  hostId: string;
  id: string;
  /** Người xem KHÔNG tham dự + `visibility=ATTENDEES` (OWNER/ADMIN nhóm): chỉ thấy metadata, không agenda/link/người. */
  isMetadataOnly: boolean;
  joinOpensAt: string;
  myActions: MyMeetingActions;
  myRole: MeetingAttendeeRole | null;
  myRsvp: MeetingRsvp | null;
  platform: MeetingPlatform;
  startAt: string;
  status: MeetingStatus;
  timezone: string;
  title: string;
  version: number;
  workspaceId: string;
}

export interface MeetingDetailDto extends MeetingListItemDto {
  agenda?: string;
  cancelReason?: string;
  coHostIds: string[];
  conversationId?: string;
  currentCallId?: string;
  endedAt?: string;
  endReason?: MeetingEndReason;
  externalUrl?: string;
  hasPublishedRecap: boolean;
  joinWindowMinutes: number;
  lobbyMode: MeetingLobbyMode;
  location?: string;
  lockedAt?: string;
  notifyVia: MeetingNotifyVia;
  readyRecordingCount: number;
  recapRequired: boolean;
  recordingAllowed: boolean;
  /**
   * CHỈ CÓ Ở CLIENT (không phải trường của BE): `Date.now()` của máy lúc nhận response này — `service` đóng dấu. Cần vì `serverNow` chỉ
   * đúng tại thời điểm nhận; đồng hồ theo giờ server = `serverNow + (bây giờ − receivedAt)`. Nằm TRONG DTO (chứ không phải `dataUpdatedAt`
   * của React Query) để vá cache (`setQueryData` lạc quan/socket) không làm nó trôi: vá giữ nguyên `serverNow` cũ VÀ `receivedAt` cũ.
   */
  receivedAt?: number;
  reminderMinutes: number[];
  rsvpSummary: Record<MeetingRsvp, number>;
  serverNow: string;
  startedAt?: string;
  visibility: MeetingVisibility;
}

export interface MeetingAttendeeDto {
  avatarUrl: string | null;
  invitedAt: string;
  name: string;
  role: MeetingAttendeeRole;
  rsvp: MeetingRsvp;
  rsvpAt: string | null;
  source: 'INVITED' | 'JOINED_VIA_LINK' | 'SERIES';
  userId: string;
}

export type ResolveTarget = 'DETAIL' | 'JOIN' | 'LOBBY';

/** `GET /meetings/resolve/:code` — người không đủ quyền chỉ nhận `allowed:false` + lý do TRUNG TÍNH (không tiêu đề, chống dò mã). */
export interface ResolveResult {
  allowed: boolean;
  meetingId?: string;
  reason?: 'NOT_AVAILABLE' | 'REMOVED';
  status?: MeetingStatus;
  target?: ResolveTarget;
}

export interface AddAttendeesResult {
  added: string[];
  alreadyAttending: string[];
  rejected: { code: string; userId: string }[];
}

export type RangeScope = 'MINE' | 'ALL_VISIBLE';

export interface MeetingRangeParams {
  from: string;
  scope: RangeScope;
  status?: MeetingStatus[];
  to: string;
  workspaceId?: string;
}

/** Body tạo (BE `createMeetingSchema`) — `startAt/endAt` là ISO UTC. */
export interface CreateMeetingPayload {
  agenda?: string;
  attendeeIds: string[];
  coHostIds: string[];
  createChatGroup: boolean;
  endAt: string;
  externalUrl?: string;
  format: MeetingFormat;
  lobbyMode: MeetingLobbyMode;
  location?: string;
  notifyVia: MeetingNotifyVia;
  platform: MeetingPlatform;
  recapRequired: boolean;
  recordingAllowed: boolean;
  reminderMinutes: number[];
  startAt: string;
  timezone: string;
  title: string;
  visibility: MeetingVisibility;
}

/** Body sửa (BE `updateMeetingSchema`, `.strict()` + `expectedVersion` bắt buộc). */
export type UpdateMeetingPayload = Partial<
  Omit<CreateMeetingPayload, 'attendeeIds' | 'coHostIds' | 'createChatGroup'>
> & {
  expectedVersion: number;
};

export interface CursorMeta {
  hasMore: boolean;
  limit: number;
  nextCursor: string | null;
}

export interface AttendeePage {
  items: MeetingAttendeeDto[];
  meta: CursorMeta;
}

/** Tuỳ chọn trong bộ chọn người tham dự (dữ liệu từ danh sách thành viên nhóm). */
export interface WorkspaceMemberOption {
  avatarUrl: string | null;
  displayName: string | null;
  name: string;
  userId: string;
}

export interface WorkspaceOption {
  avatarUrl: string | null;
  id: string;
  myRole: string;
  name: string;
}
