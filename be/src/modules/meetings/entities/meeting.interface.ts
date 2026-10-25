import type {
  MeetingAttendeeRole,
  MeetingAttendeeSource,
  MeetingEndReason,
  MeetingFormat,
  MeetingLobbyMode,
  MeetingNotifyVia,
  MeetingPlatform,
  MeetingRsvp,
  MeetingStatus,
  MeetingVisibility,
} from "@prisma/client";

export type MeetingStatusValue = MeetingStatus;
export type MeetingAttendeeRoleValue = MeetingAttendeeRole;
export type MeetingRsvpValue = MeetingRsvp;
export type MeetingPlatformValue = MeetingPlatform;
export type MeetingFormatValue = MeetingFormat;
export type MeetingVisibilityValue = MeetingVisibility;
export type MeetingLobbyModeValue = MeetingLobbyMode;
export type MeetingNotifyViaValue = MeetingNotifyVia;
export type MeetingEndReasonValue = MeetingEndReason;

export interface MeetingEntity {
  id: string;
  workspaceId: string;
  code: string;
  title: string;
  normalizedTitle: string;
  agenda: string | null;
  format: MeetingFormatValue;
  location: string | null;
  platform: MeetingPlatformValue;
  externalUrl: string | null;
  startAt: Date;
  endAt: Date;
  timezone: string;
  seriesId: string | null;
  occurrenceIndex: number | null;
  isSeriesException: boolean;
  status: MeetingStatusValue;
  hostId: string;
  visibility: MeetingVisibilityValue;
  lobbyMode: MeetingLobbyModeValue;
  joinWindowMinutes: number;
  reminderMinutes: number[];
  notifyVia: MeetingNotifyViaValue;
  recapRequired: boolean;
  recordingAllowed: boolean;
  createChatGroup: boolean;
  conversationId: string | null;
  currentCallId: string | null;
  lockedAt: Date | null;
  startedAt: Date | null;
  endedAt: Date | null;
  endReason: MeetingEndReasonValue | null;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  attendeeCount: number;
  createdBy: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AttendeeEntity {
  id: string;
  meetingId: string;
  workspaceId: string;
  userId: string;
  role: MeetingAttendeeRoleValue;
  rsvp: MeetingRsvpValue;
  rsvpAt: Date | null;
  source: MeetingAttendeeSource;
  invitedBy: string | null;
  invitedAt: Date;
  removedAt: Date | null;
  removedBy: string | null;
  firstJoinedAt: Date | null;
  attendedSeconds: number;
  meetingStartAt: Date;
  meetingEndAt: Date;
  meetingStatus: MeetingStatusValue;
}

export type NewMeeting = Omit<MeetingEntity, "version" | "createdAt" | "updatedAt">;
export type NewAttendee = Pick<AttendeeEntity, "meetingId" | "workspaceId" | "userId" | "role" | "rsvp" | "source" | "invitedBy" | "meetingStartAt" | "meetingEndAt" | "meetingStatus"> &
  Partial<Pick<AttendeeEntity, "rsvpAt">>;

export type MeetingPatch = Partial<
  Pick<
    MeetingEntity,
    | "title"
    | "normalizedTitle"
    | "agenda"
    | "format"
    | "location"
    | "platform"
    | "externalUrl"
    | "startAt"
    | "endAt"
    | "timezone"
    | "status"
    | "hostId"
    | "visibility"
    | "lobbyMode"
    | "joinWindowMinutes"
    | "reminderMinutes"
    | "notifyVia"
    | "recapRequired"
    | "recordingAllowed"
    | "conversationId"
    | "cancelledAt"
    | "cancelledBy"
    | "cancelReason"
    | "deletedAt"
    | "deletedBy"
    | "endReason"
    // p2-05 phòng họp
    | "currentCallId"
    | "lockedAt"
    | "startedAt"
    | "endedAt"
    | "createChatGroup"
  >
>;

export type AttendeePatch = Partial<
  Pick<AttendeeEntity, "role" | "rsvp" | "rsvpAt" | "source" | "invitedBy" | "invitedAt" | "removedAt" | "removedBy" | "meetingStartAt" | "meetingEndAt" | "meetingStatus" | "firstJoinedAt" | "attendedSeconds">
>;

// ── DTO ────────────────────────────────────────────────────────────────────

export interface MyMeetingActions {
  canEdit: boolean;
  canEditLimited: boolean;
  canManageAttendees: boolean;
  canManageRoles: boolean;
  canCancel: boolean;
  cancelRequiresReason: boolean;
  canDelete: boolean;
  canStart: boolean;
  canJoin: boolean;
  joinVia: "DIRECT" | "WAIT_FOR_HOST" | "LOBBY" | null;
  canEnd: boolean;
  canOpenExternal: boolean;
  canRsvp: boolean;
  canLeaveAttendance: boolean;
  canViewRecap: boolean;
  canEditRecap: boolean;
  canRecord: boolean;
}

export interface MeetingListItemDto {
  id: string;
  workspaceId: string;
  code: string;
  title: string;
  status: MeetingStatusValue;
  startAt: string;
  endAt: string;
  timezone: string;
  format: MeetingFormatValue;
  platform: MeetingPlatformValue;
  hostId: string;
  attendeeCount: number;
  myRole: MeetingAttendeeRoleValue | null;
  myRsvp: MeetingRsvpValue | null;
  isMetadataOnly: boolean;
  myActions: MyMeetingActions;
  joinOpensAt: string;
  version: number;
}

export interface MeetingDetailDto extends MeetingListItemDto {
  agenda?: string;
  location?: string;
  externalUrl?: string;
  visibility: MeetingVisibilityValue;
  lobbyMode: MeetingLobbyModeValue;
  joinWindowMinutes: number;
  reminderMinutes: number[];
  notifyVia: MeetingNotifyViaValue;
  recapRequired: boolean;
  recordingAllowed: boolean;
  conversationId?: string;
  currentCallId?: string;
  lockedAt?: string;
  startedAt?: string;
  endedAt?: string;
  endReason?: MeetingEndReasonValue;
  cancelReason?: string;
  rsvpSummary: Record<MeetingRsvpValue, number>;
  coHostIds: string[];
  hasPublishedRecap: boolean;
  readyRecordingCount: number;
  serverNow: string;
}

export interface AttendeeDto {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: MeetingAttendeeRoleValue;
  rsvp: MeetingRsvpValue;
  rsvpAt: string | null;
  source: MeetingAttendeeSource;
  invitedAt: string;
}

export type ResolveTarget = "DETAIL" | "JOIN" | "LOBBY";
export interface ResolveResult {
  allowed: boolean;
  target?: ResolveTarget;
  reason?: "NOT_AVAILABLE" | "REMOVED";
  meetingId?: string;
  status?: MeetingStatusValue;
}
