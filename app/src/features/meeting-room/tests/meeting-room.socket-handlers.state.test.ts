import { queryClient } from '@/core/config/query-client';

import { meetingRoomKeys } from '../api/meeting-room.keys';
import { meetingRoomService } from '../api/meeting-room.service';
import { JOIN_RETRY_DEBOUNCE_MS } from '../constants/meeting-room.constants';
import {
  handleCancelled,
  handleEnded,
  handleResync,
  handleRevoked,
  handleUpdated,
} from '../hooks/meeting-room.socket-handlers';
import { meetingRoomApi } from '../store/meeting-room.store';
import { cleanupController, installFakeMedia, setPhase } from './controller-kit';
import { makeBrief, makeSnapshot } from './fixtures';
import { flushMicrotasks } from './hook-wrapper';

/** Kết thúc/huỷ, khoá phòng + sắp đóng, mất quyền, chat chưa đọc, socket nối lại (app.md §4.3). Sự kiện của phòng KHÁC luôn bị bỏ. */
jest.mock('@/core/media/permissions', () => ({
  ensureCameraPermission: jest.fn(() => Promise.resolve('granted')),
  ensureMicrophonePermission: jest.fn(() => Promise.resolve('granted')),
  openAppSettings: jest.fn(),
}));
jest.mock('@/core/device/device-id', () => ({ getDeviceId: jest.fn(() => Promise.resolve('dev-1')) }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/meeting-room.service', () => ({
  meetingRoomService: { getBrief: jest.fn(), join: jest.fn(), leave: jest.fn(), renewToken: jest.fn(), snapshot: jest.fn() },
}));

const service = jest.mocked(meetingRoomService);

beforeEach(() => {
  jest.clearAllMocks();
  service.join.mockReset();
  service.leave.mockResolvedValue(undefined);
  service.getBrief.mockResolvedValue(makeBrief());
  service.snapshot.mockResolvedValue(makeSnapshot());
  installFakeMedia();
});

afterEach(cleanupController);

describe('meeting:ended / meeting:cancelled', () => {
  it('đang trong phòng → ENDED với lý do + thời lượng của server, ngắt media', async () => {
    setPhase('IN_ROOM');
    handleEnded({ callId: 'call1', durationSec: 1800, meetingId: 'm1', reason: 'HOST_ENDED' });
    await flushMicrotasks();
    expect(meetingRoomApi.get()).toMatchObject({ endedDurationSec: 1800, endedReason: 'HOST_ENDED', phase: 'ENDED' });
  });

  it('chưa vào phòng (pre-join/chờ/lobby) → "cuộc họp không còn diễn ra" (BLOCKED MEET_009), không phải màn "đã kết thúc"', async () => {
    for (const phase of ['PREJOIN', 'WAITING_FOR_HOST', 'IN_LOBBY'] as const) {
      setPhase(phase);
      handleEnded({ callId: null, durationSec: 0, meetingId: 'm1', reason: 'HOST_ENDED' });
      await flushMicrotasks();
      expect(meetingRoomApi.get()).toMatchObject({ blockedCode: 'MEET_009', phase: 'BLOCKED' });
    }
  });

  it('đã ENDED (LiveKit room-closed tới trước) mà chưa có lý do → socket tới sau BỔ SUNG lý do, không đổi pha', async () => {
    setPhase('IN_ROOM');
    meetingRoomApi.patch({ endedReason: null, phase: 'ENDED' });
    handleEnded({ callId: 'call1', durationSec: 60, meetingId: 'm1', reason: 'MAX_DURATION' });
    await flushMicrotasks();
    expect(meetingRoomApi.get()).toMatchObject({ endedReason: 'MAX_DURATION', phase: 'ENDED' });
  });

  it('cuộc họp khác bị bỏ; huỷ lịch khi đang chờ → không còn diễn ra', async () => {
    setPhase('IN_ROOM');
    handleEnded({ callId: null, durationSec: 0, meetingId: 'khac', reason: 'HOST_ENDED' });
    await flushMicrotasks();
    expect(meetingRoomApi.get().phase).toBe('IN_ROOM');

    setPhase('WAITING_FOR_HOST');
    handleCancelled('m1');
    await flushMicrotasks();
    expect(meetingRoomApi.get()).toMatchObject({ blockedCode: 'MEET_009', phase: 'BLOCKED' });
  });
});

describe('meeting:updated — khoá phòng / sắp đóng', () => {
  it('lockedAt/closingAt vào store (và xoá khi null); đổi lịch → làm mới chi tiết', () => {
    setPhase('IN_ROOM');
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    handleUpdated({ changedFields: ['lockedAt'], lockedAt: '2026-10-01T09:10:00.000Z', meetingId: 'm1', version: 5 });
    expect(meetingRoomApi.get().lockedAt).toBe('2026-10-01T09:10:00.000Z');
    expect(invalidate).not.toHaveBeenCalled();

    handleUpdated({ changedFields: ['closingAt'], closingAt: '2026-10-01T09:55:00.000Z', meetingId: 'm1', version: 6 });
    expect(meetingRoomApi.get().closingAt).toBe('2026-10-01T09:55:00.000Z');

    handleUpdated({ changedFields: ['lockedAt', 'closingAt'], closingAt: null, lockedAt: null, meetingId: 'm1', version: 7 });
    expect(meetingRoomApi.get()).toMatchObject({ closingAt: null, lockedAt: null });

    handleUpdated({ changedFields: ['endAt'], meetingId: 'm1', version: 8 });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: meetingRoomKeys.brief('m1') });
  });
});

describe('permission:revoked / nối lại socket', () => {
  it('mất quyền với cuộc họp (hoặc cuộc gọi) của phòng này → "không còn khả dụng"; scope khác bị bỏ', async () => {
    setPhase('IN_ROOM');
    handleRevoked({ cascade: false, reason: 'REMOVED', scopeId: 'khac', scopeType: 'MEETING', v: 1, version: 2 });
    handleRevoked({ cascade: false, reason: 'REMOVED', scopeId: 'm1', scopeType: 'CHANNEL', v: 1, version: 2 });
    await flushMicrotasks();
    expect(meetingRoomApi.get().phase).toBe('IN_ROOM');

    handleRevoked({ cascade: false, reason: 'REMOVED', scopeId: 'm1', scopeType: 'MEETING', v: 1, version: 2 });
    await flushMicrotasks();
    expect(meetingRoomApi.get()).toMatchObject({ blockedCode: 'GONE', phase: 'BLOCKED' });

    setPhase('IN_ROOM');
    handleRevoked({ cascade: false, reason: 'ARCHIVED', scopeId: 'call1', scopeType: 'CALL', v: 1, version: 3 });
    await flushMicrotasks();
    expect(meetingRoomApi.get().phase).toBe('BLOCKED');
  });

  it('socket nối lại: tải lại ảnh chụp + chi tiết; đang chờ chủ trì thì gọi `join` lại; chưa mở phòng nào → không làm gì', async () => {
    setPhase('WAITING_FOR_HOST');
    service.join.mockResolvedValue({ joinOpensAt: 'a', meetingId: 'm1', serverNow: '2026-10-01T09:00:00.000Z', startAt: 'b', state: 'WAITING_FOR_HOST' });
    handleResync();
    await jest.advanceTimersByTimeAsync(JOIN_RETRY_DEBOUNCE_MS + 1);
    await flushMicrotasks();

    expect(service.snapshot).toHaveBeenCalledWith('m1');
    expect(service.getBrief).toHaveBeenCalledWith('m1');
    expect(service.join).toHaveBeenCalledTimes(1);

    meetingRoomApi.reset();
    jest.clearAllMocks();
    handleResync();
    expect(service.snapshot).not.toHaveBeenCalled();
  });
});
