import { apiClient } from '@/core/api/client';

import { meetingRoomService } from '../api/meeting-room.service';
import { meetingRoomHostService } from '../api/meeting-room-host.service';
import { makeBrief } from './fixtures';

/** Tầng service: đường dẫn/phương thức đúng hợp đồng BE (p2-05 be.md §4), MỌI lời gọi `skipErrorToast`, bóc `{data}`, đóng dấu giờ nhận. */
jest.mock('@/core/api/client', () => ({
  apiClient: { delete: jest.fn(), get: jest.fn(), post: jest.fn() },
}));

const api = jest.mocked(apiClient);
const ok = (data: unknown) => Promise.resolve({ data: { data } });

beforeEach(() => jest.clearAllMocks());

describe('meetingRoomService', () => {
  it('getBrief: GET /meetings/:id, bóc data và đóng dấu `receivedAt` (giờ máy lúc nhận `serverNow`)', async () => {
    api.get.mockReturnValueOnce(ok({ ...makeBrief(), receivedAt: undefined }));
    const before = Date.now();
    const brief = await meetingRoomService.getBrief('m1');
    expect(api.get).toHaveBeenCalledWith('/meetings/m1', { skipErrorToast: true });
    expect(brief.receivedAt).toBeGreaterThanOrEqual(before);
    expect(brief.title).toBe('Họp giao ban');
  });

  it('start: POST /start kèm expectedVersion + deviceId; trả cả chi tiết mới (đóng dấu)', async () => {
    api.post.mockReturnValueOnce(ok({ meeting: makeBrief({ status: 'LIVE' }), meetingId: 'm1', serverNow: 'x', state: 'IN_LOBBY' }));
    const result = await meetingRoomService.start('m1', { deviceId: 'd1', expectedVersion: 3, force: false });
    expect(api.post).toHaveBeenCalledWith('/meetings/m1/start', { deviceId: 'd1', expectedVersion: 3, force: false }, { skipErrorToast: true });
    expect(result.meeting?.receivedAt).toEqual(expect.any(Number));
  });

  it('join / leave / end / room / token / chat-group', async () => {
    api.post.mockReturnValue(ok({}));
    api.get.mockReturnValue(ok({}));
    await meetingRoomService.join('m1', { deviceId: 'd1', displayName: 'An' });
    expect(api.post).toHaveBeenLastCalledWith('/meetings/m1/join', { deviceId: 'd1', displayName: 'An' }, { skipErrorToast: true });
    await meetingRoomService.leave('m1');
    expect(api.post).toHaveBeenLastCalledWith('/meetings/m1/leave', {}, { skipErrorToast: true });
    await meetingRoomService.leave('m1', 'u2');
    expect(api.post).toHaveBeenLastCalledWith('/meetings/m1/leave', { transferControlTo: 'u2' }, { skipErrorToast: true });
    await meetingRoomService.snapshot('m1');
    expect(api.get).toHaveBeenLastCalledWith('/meetings/m1/room', { skipErrorToast: true });
    await meetingRoomService.renewToken('c1');
    expect(api.post).toHaveBeenLastCalledWith('/calls/c1/token', {}, { skipErrorToast: true });
    await meetingRoomService.ensureChatGroup('m1');
    expect(api.post).toHaveBeenLastCalledWith('/meetings/m1/chat-group', {}, { skipErrorToast: true });
  });

  it('listAllAttendees gom trang theo cursor và dừng khi hết (≤ 4 trang)', async () => {
    const page = (n: number, next: string | null) => Promise.resolve({ data: { data: [{ name: `P${n}`, role: 'ATTENDEE', rsvp: 'PENDING', userId: `u${n}` }], meta: { nextCursor: next } } });
    api.get.mockReturnValueOnce(page(1, 'c2')).mockReturnValueOnce(page(2, 'c3')).mockReturnValueOnce(page(3, null));
    const all = await meetingRoomService.listAllAttendees('m1');
    expect(all.map((a) => a.userId)).toEqual(['u1', 'u2', 'u3']);
    expect(api.get).toHaveBeenNthCalledWith(2, '/meetings/m1/attendees', expect.objectContaining({ params: { cursor: 'c2', limit: 100 } }));
  });

  it('listAllAttendees không đi quá 4 trang dù server còn cursor', async () => {
    api.get.mockImplementation(() => Promise.resolve({ data: { data: [], meta: { nextCursor: 'more' } } }));
    await meetingRoomService.listAllAttendees('m1');
    expect(api.get).toHaveBeenCalledTimes(4);
  });

  it('chatAccess: chỉ đọc quyền gửi tin của MÌNH', async () => {
    api.get.mockReturnValueOnce(ok({ myPermissions: { canSend: true }, readOnlyReason: null }));
    await expect(meetingRoomService.chatAccess('conv1')).resolves.toEqual({ canSend: true, readOnlyReason: null });
    api.get.mockReturnValueOnce(ok({}));
    await expect(meetingRoomService.chatAccess('conv1')).resolves.toEqual({ canSend: false, readOnlyReason: null });
  });
});

describe('meetingRoomHostService', () => {
  beforeEach(() => {
    api.post.mockReturnValue(ok({}));
    api.get.mockReturnValue(ok([]));
    api.delete.mockReturnValue(Promise.resolve({}));
  });

  it('phòng chờ: list / admit / deny / admit-all / huỷ yêu cầu của mình', async () => {
    await meetingRoomHostService.listLobby('m1');
    expect(api.get).toHaveBeenLastCalledWith('/meetings/m1/lobby', { skipErrorToast: true });
    await meetingRoomHostService.admit('m1', 'u2');
    expect(api.post).toHaveBeenLastCalledWith('/meetings/m1/lobby/u2/admit', {}, { skipErrorToast: true });
    await meetingRoomHostService.deny('m1', 'u2');
    expect(api.post).toHaveBeenLastCalledWith('/meetings/m1/lobby/u2/deny', {}, { skipErrorToast: true });
    await meetingRoomHostService.admitAll('m1');
    expect(api.post).toHaveBeenLastCalledWith('/meetings/m1/lobby/admit-all', {}, { skipErrorToast: true });
    await meetingRoomHostService.cancelMyRequest('m1');
    expect(api.delete).toHaveBeenLastCalledWith('/meetings/m1/lobby/me', { skipErrorToast: true });
  });

  it('điều khiển: khoá/mở khoá, tắt mic một người/tất cả, mời ra, đổi vai trò, hạ tay, giao quyền', async () => {
    await meetingRoomHostService.setLocked('m1', true);
    expect(api.post).toHaveBeenLastCalledWith('/meetings/m1/lock', {}, { skipErrorToast: true });
    await meetingRoomHostService.setLocked('m1', false);
    expect(api.post).toHaveBeenLastCalledWith('/meetings/m1/unlock', {}, { skipErrorToast: true });
    await meetingRoomHostService.mute('m1', 'u2', 'CAMERA');
    expect(api.post).toHaveBeenLastCalledWith('/meetings/m1/participants/u2/mute', { source: 'CAMERA' }, { skipErrorToast: true });
    await meetingRoomHostService.muteAll('m1');
    expect(api.post).toHaveBeenLastCalledWith('/meetings/m1/participants/mute-all', { source: 'MICROPHONE' }, { skipErrorToast: true });
    await meetingRoomHostService.remove('m1', 'u2', true);
    expect(api.post).toHaveBeenLastCalledWith('/meetings/m1/participants/u2/remove', { alsoRemoveAttendee: true }, { skipErrorToast: true });
    await meetingRoomHostService.setRole('m1', 'u2', 'CO_HOST');
    expect(api.post).toHaveBeenLastCalledWith('/meetings/m1/participants/u2/role', { role: 'CO_HOST' }, { skipErrorToast: true });
    await meetingRoomHostService.lowerAllHands('m1');
    expect(api.post).toHaveBeenLastCalledWith('/meetings/m1/hands/lower-all', {}, { skipErrorToast: true });
    await meetingRoomHostService.transferControl('m1', 'u3');
    expect(api.post).toHaveBeenLastCalledWith('/meetings/m1/transfer-control', { toUserId: 'u3' }, { skipErrorToast: true });
  });
});
