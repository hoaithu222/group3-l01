import { queryClient } from '@/core/config/query-client';

import { beginMeeting, clearRejoin } from '../hooks/meeting-room.join';
import { connectToRoom } from '../hooks/meeting-room.session';
import { teardownMeetingSession } from '../hooks/meeting-room.teardown';
import { FakeMeetingMedia } from '../media/meeting-media.fake';
import { setMeetingMediaForTests } from '../media/meeting-media.registry';
import { meetingRoomApi, type PreJoinPrefs } from '../store/meeting-room.store';
import { makeBrief, makeJoined } from './fixtures';

/**
 * Đồ dùng chung cho test CONTROLLER (session/join/leave/socket-handlers). KHÔNG phải test. `jest.mock(...)` phải nằm trong từng file test
 * (Jest nâng chúng lên đầu file) nên không đặt ở đây.
 */

/** Token mới mà `POST /calls/:id/token` (giả) trả về. */
export const FRESH_TOKEN = { expiresAt: '2099-01-01T00:00:00.000Z', livekitUrl: 'ws://livekit.fresh', token: 'fresh.token' };

/** Cắm cổng media GIẢ cho test (không nạp SDK native) và bật timer giả. Gọi trong `beforeEach`. */
export function installFakeMedia(): FakeMeetingMedia {
  jest.useFakeTimers();
  const media = new FakeMeetingMedia();
  setMeetingMediaForTests(media);
  return media;
}

/** Dọn sau mỗi test: ngắt phiên, xoá store/cache, gỡ cổng giả, trả timer thật (không để hẹn giờ nào giữ tiến trình Jest). */
export async function cleanupController(): Promise<void> {
  clearRejoin();
  await teardownMeetingSession();
  meetingRoomApi.reset();
  setMeetingMediaForTests(null);
  queryClient.clear();
  jest.clearAllTimers();
  jest.useRealTimers();
}

/** Phiên vừa `JOINED` và đang chờ nối media (đúng trạng thái `applyJoinResult` để lại). */
export function startSession(prefs: Partial<PreJoinPrefs> = {}, role: 'CO_HOST' | 'HOST' | 'MEMBER' = 'MEMBER'): void {
  meetingRoomApi.reset();
  meetingRoomApi.applyJoined(makeJoined({ role }), 0);
  meetingRoomApi.patch({ meetingId: 'm1', phase: 'CONNECTING', preJoin: { ...meetingRoomApi.get().preJoin, ...prefs }, startedAt: '2026-10-01T09:00:00.000Z' });
}

/** Đang trong phòng thật (nối bằng bản giả) — để kiểm ngắt media chứ không chỉ đổi store. */
export async function inRoom(role: 'HOST' | 'MEMBER' = 'HOST'): Promise<void> {
  startSession({}, role);
  await connectToRoom();
}

/** Đặt thẳng pha (không nối media) cho test socket handler. */
export function setPhase(
  phase: 'IN_LOBBY' | 'IN_ROOM' | 'PREJOIN' | 'WAITING_FOR_HOST',
  extra: Parameters<typeof meetingRoomApi.patch>[0] = {},
): void {
  meetingRoomApi.reset();
  meetingRoomApi.patch({ callId: 'call1', conversationId: 'conv1', meetingId: 'm1', phase, role: 'MEMBER', ...extra });
}

/** Chi tiết của CHỦ TRÌ chưa bắt đầu (`canStart`) — nút chính là "Bắt đầu cuộc họp". */
export const HOST_BRIEF = makeBrief({
  myActions: { canEnd: true, canJoin: false, canRecord: false, canStart: true, joinVia: null },
  myRole: 'HOST',
  status: 'SCHEDULED',
  version: 7,
});

/** Kết quả `join` khi chủ trì chưa bắt đầu. */
export const WAITING_RESULT = {
  joinOpensAt: '2026-10-01T08:50:00.000Z',
  meetingId: 'm1',
  serverNow: '2026-10-01T08:55:00.000Z',
  startAt: '2026-10-01T09:00:00.000Z',
  state: 'WAITING_FOR_HOST',
} as const;

/** Mở màn pre-join của cuộc họp `m1` với chi tiết đã tải. */
export function openMeeting(brief = makeBrief()): void {
  meetingRoomApi.reset();
  beginMeeting('m1');
  meetingRoomApi.patch({ brief });
}
