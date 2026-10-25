import type {
  MeetingAttendeeDto,
  MeetingDetailDto,
  MeetingListItemDto,
  MyMeetingActions,
} from '../api/meetings.types';

/** Dữ liệu giả của `meetings` — hình dạng đúng như BE trả (`be/src/modules/meetings/entities/meeting.interface.ts`). */

/** Mọi cờ tắt: mỗi ca test bật đúng cờ nó quan tâm, để "không có cờ ⇒ không có nút" được kiểm thật. */
export const NO_ACTIONS: MyMeetingActions = {
  canCancel: false,
  canDelete: false,
  canEdit: false,
  canEditLimited: false,
  canEditRecap: false,
  canEnd: false,
  canJoin: false,
  canLeaveAttendance: false,
  canManageAttendees: false,
  canManageRoles: false,
  canOpenExternal: false,
  canRecord: false,
  canRsvp: false,
  canStart: false,
  canViewRecap: false,
  cancelRequiresReason: false,
  joinVia: null,
};

export function makeActions(overrides: Partial<MyMeetingActions> = {}): MyMeetingActions {
  return { ...NO_ACTIONS, ...overrides };
}

export function makeListItem(overrides: Partial<MeetingListItemDto> = {}): MeetingListItemDto {
  return {
    attendeeCount: 3,
    code: 'abc-defg-hij',
    endAt: '2026-09-30T03:00:00.000Z',
    format: 'ONLINE',
    hostId: 'host-1',
    id: 'm1',
    isMetadataOnly: false,
    joinOpensAt: '2026-09-30T01:50:00.000Z',
    myActions: makeActions(),
    myRole: 'ATTENDEE',
    myRsvp: 'PENDING',
    platform: 'INTERNAL',
    startAt: '2026-09-30T02:00:00.000Z',
    status: 'SCHEDULED',
    timezone: 'Asia/Ho_Chi_Minh',
    title: 'Họp giao ban',
    version: 2,
    workspaceId: 'ws-1',
    ...overrides,
  };
}

export function makeMeeting(overrides: Partial<MeetingDetailDto> = {}): MeetingDetailDto {
  return {
    ...makeListItem(),
    coHostIds: [],
    hasPublishedRecap: false,
    joinWindowMinutes: 10,
    lobbyMode: 'NON_ATTENDEES',
    notifyVia: 'APP',
    readyRecordingCount: 0,
    recapRequired: false,
    recordingAllowed: true,
    reminderMinutes: [15],
    rsvpSummary: { ACCEPTED: 1, DECLINED: 0, PENDING: 2, TENTATIVE: 0 },
    serverNow: '2026-09-30T01:00:00.000Z',
    visibility: 'ATTENDEES',
    ...overrides,
  };
}

export function makeAttendee(overrides: Partial<MeetingAttendeeDto> = {}): MeetingAttendeeDto {
  return {
    avatarUrl: null,
    invitedAt: '2026-09-25T00:00:00.000Z',
    name: 'Nguyễn Văn A',
    role: 'ATTENDEE',
    rsvp: 'ACCEPTED',
    rsvpAt: null,
    source: 'INVITED',
    userId: 'u-a',
    ...overrides,
  };
}
