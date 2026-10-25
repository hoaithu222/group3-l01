import type {
  JoinedResult,
  LobbyEntry,
  MeetingBrief,
  RoomParticipantDto,
  RoomSnapshot,
} from '../api/meeting-room.types';
import type { MeetingMediaParticipant } from '../media/meeting-media.types';
import type { RoomPerson } from '../utils/room-people.utils';

/** Dữ liệu mẫu dùng chung cho test của `meeting-room` (component + hook + màn). */

export function makeBrief(over: Partial<MeetingBrief> = {}): MeetingBrief {
  return {
    endAt: '2026-10-01T10:00:00.000Z',
    hostId: 'host',
    id: 'm1',
    joinOpensAt: '2026-10-01T08:50:00.000Z',
    lobbyMode: 'NON_ATTENDEES',
    myActions: { canEnd: false, canJoin: true, canRecord: false, canStart: false, joinVia: 'DIRECT' },
    myRole: 'ATTENDEE',
    platform: 'INTERNAL',
    receivedAt: Date.now(),
    recapRequired: false,
    recordingAllowed: true,
    serverNow: '2026-10-01T09:00:00.000Z',
    startAt: '2026-10-01T09:00:00.000Z',
    status: 'LIVE',
    title: 'Họp giao ban',
    version: 3,
    ...over,
  };
}

export function makeJoined(over: Partial<JoinedResult> = {}): JoinedResult {
  return {
    callId: 'call1',
    closingAt: null,
    conversationId: 'conv1',
    livekitRoom: 'meet_abcdefghij',
    livekitUrl: 'ws://livekit.test',
    lockedAt: null,
    meetingId: 'm1',
    publishPermissions: { audio: true, screen: true, video: true },
    recording: null,
    role: 'MEMBER',
    serverNow: '2026-10-01T09:00:00.000Z',
    state: 'JOINED',
    token: 'jwt.token.value',
    tokenExpiresAt: '2099-01-01T00:00:00.000Z',
    ...over,
  };
}

export function makePerson(over: Partial<RoomPerson> & { userId: string }): RoomPerson {
  return {
    cameraEnabled: false,
    connectionQuality: 'good',
    handRaisedAt: null,
    isLocal: false,
    isSpeaking: false,
    micEnabled: true,
    mutedByHost: false,
    name: `Người ${over.userId}`,
    role: 'MEMBER',
    screenShareRef: null,
    videoRef: null,
    ...over,
  };
}

export function makeServerParticipant(over: Partial<RoomParticipantDto> & { userId: string }): RoomParticipantDto {
  return {
    handRaisedAt: null,
    joinedAt: '2026-10-01T09:00:00.000Z',
    mutedByHost: false,
    name: `Người ${over.userId}`,
    role: 'MEMBER',
    state: 'CONNECTED',
    ...over,
  };
}

export function makeSnapshot(over: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return {
    callId: 'call1',
    closingAt: null,
    lobbyCount: 0,
    lockedAt: null,
    meetingId: 'm1',
    myRole: 'MEMBER',
    participants: [],
    recording: null,
    serverNow: '2026-10-01T09:00:00.000Z',
    status: 'LIVE',
    version: 3,
    ...over,
  };
}

/** Người trong phòng phía MEDIA (SDK) cho test controller/hook — mặc định mic bật, camera tắt, chất lượng tốt. */
export function fakeParticipant(over: Partial<MeetingMediaParticipant> & { identity: string }): MeetingMediaParticipant {
  return {
    cameraEnabled: false,
    connectionQuality: 'good',
    handRaisedAt: null,
    isLocal: false,
    isSpeaking: false,
    micEnabled: true,
    name: over.identity,
    screenShareRef: null,
    videoRef: null,
    ...over,
  };
}

export const makeLobbyEntry = (userId: string, over: Partial<LobbyEntry> = {}): LobbyEntry => ({
  displayName: `Khách ${userId}`,
  requestedAt: '2026-10-01T09:01:00.000Z',
  userId,
  ...over,
});
