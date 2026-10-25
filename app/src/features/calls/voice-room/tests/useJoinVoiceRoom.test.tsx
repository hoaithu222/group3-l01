import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { ensureCameraPermission, ensureMicrophonePermission } from '@/core/media/permissions';

import { callsService } from '../../api/calls.service';
import { callStoreApi } from '../../store/call.store';
import { useJoinVoiceRoom } from '../hooks/useJoinVoiceRoom';
import { voiceJoinPrefs } from '../store/voice-join.prefs';
import { apiError, makeRoomCall } from './helpers';

/** `useJoinVoiceRoom` (app.md §8 VR-02/VR-05/VR-06): "để nghe" không xin quyền; CALL_004 → hỏi rồi `force`; CALL_016/008/018. */
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() } }));
jest.mock('@/core/device/device-id', () => ({ getDeviceId: jest.fn(() => Promise.resolve('device-1')) }));
jest.mock('@/core/media/permissions', () => ({
  ensureCameraPermission: jest.fn(() => Promise.resolve('granted')),
  ensureMicrophonePermission: jest.fn(() => Promise.resolve('granted')),
}));
jest.mock('../../api/calls.service', () => ({
  callsService: { cancel: jest.fn(), create: jest.fn(), get: jest.fn(), leave: jest.fn(() => Promise.resolve({})) },
}));

const create = jest.mocked(callsService.create);
const token = { expiresAt: '2026-09-25T10:10:00.000Z', livekitUrl: 'wss://lk', token: 'jwt' };

async function mount() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  const hook = await renderHook(() => useJoinVoiceRoom('ch1'), { wrapper });
  return { ...hook, invalidate };
}

beforeEach(() => {
  jest.clearAllMocks();
  callStoreApi.dispatch({ type: 'RESET' });
  voiceJoinPrefs.take();
});

describe('useJoinVoiceRoom', () => {
  it('VR-02: "Tham gia để nghe" tạo/vào phòng KHÔNG xin quyền mic/camera; lựa chọn đi qua prefs tới bước media; mở màn phòng', async () => {
    create.mockResolvedValue({ call: makeRoomCall(), joined: false, serverNow: 'x', token });
    const { result } = await mount();

    let ok = false;
    await act(async () => {
      ok = await result.current.join({ camera: false, listenOnly: true });
    });
    expect(ok).toBe(true);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ deviceId: 'device-1', mediaKind: 'AUDIO', scopeId: 'ch1', scopeType: 'CHANNEL' }));
    expect(create.mock.calls[0]?.[0].force).toBeUndefined();
    expect(ensureMicrophonePermission).not.toHaveBeenCalled();
    expect(ensureCameraPermission).not.toHaveBeenCalled();
    expect(callStoreApi.get()).toMatchObject({ callId: 'call1', phase: 'connecting' }); // phòng: không đổ chuông
    expect(router.push).toHaveBeenCalledWith({ params: { callId: 'call1' }, pathname: '/call/[callId]' });
    expect(voiceJoinPrefs.take()).toEqual({ camera: false, listenOnly: true });
  });

  it('bật camera khi vào → mediaKind VIDEO', async () => {
    create.mockResolvedValue({ call: makeRoomCall({ mediaKind: 'VIDEO' }), joined: true, serverNow: 'x', token });
    const { result } = await mount();
    await act(async () => {
      await result.current.join({ camera: true, listenOnly: false });
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ mediaKind: 'VIDEO' }));
  });

  it('VR-05: CALL_004 sameCallOtherDevice → hỏi "chuyển sang máy này"; xác nhận mới gọi lại với force', async () => {
    create.mockRejectedValueOnce(apiError(409, 'CALL_004', { sameCallOtherDevice: true }));
    const { result } = await mount();
    await act(async () => {
      await result.current.join({ camera: false, listenOnly: false });
    });
    expect(result.current.switchPrompt).toMatchObject({ kind: 'SAME_ROOM_OTHER_DEVICE' });
    expect(result.current.failure).toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
    expect(voiceJoinPrefs.take()).toEqual({ camera: false, listenOnly: false }); // lần thất bại không để lại lựa chọn cho cuộc gọi sau

    create.mockResolvedValueOnce({ call: makeRoomCall(), joined: true, serverNow: 'x', token });
    await act(async () => {
      await result.current.confirmSwitch();
    });
    expect(create).toHaveBeenLastCalledWith(expect.objectContaining({ force: true }));
    expect(result.current.switchPrompt).toBeNull();
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('CALL_004 kèm activeCall → câu hỏi nêu tên cuộc gọi đang ở; "Ở lại" đóng hộp thoại, không gọi API thêm', async () => {
    create.mockRejectedValueOnce(apiError(409, 'CALL_004', { activeCall: { id: 'c9', scopeTitle: 'Nam', scopeType: 'CONVERSATION' }, activeCallId: 'c9' }));
    const { result } = await mount();
    await act(async () => {
      await result.current.join({ camera: false, listenOnly: false });
    });
    expect(result.current.switchPrompt).toMatchObject({ kind: 'OTHER_CALL', title: 'Nam' });
    await act(async () => result.current.dismissSwitch());
    expect(result.current.switchPrompt).toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('VR-06: CALL_016 (đã bị mời ra khỏi phiên này) → failure REMOVED + làm mới preview; không hộp thoại chuyển', async () => {
    create.mockRejectedValueOnce(apiError(403, 'CALL_016'));
    const { invalidate, result } = await mount();
    await act(async () => {
      await result.current.join({ camera: false, listenOnly: false });
    });
    expect(result.current.failure).toMatchObject({ kind: 'REMOVED' });
    expect(result.current.switchPrompt).toBeNull();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['voice-room', 'preview', 'ch1'] });
    expect(callStoreApi.get().phase).toBe('idle'); // START_FAILED trả store về idle
  });

  it.each([
    ['CALL_008', 'FULL'],
    ['CALL_018', 'ARCHIVED'],
    ['CALL_012', 'FEATURE_OFF'],
  ])('%s → failure %s', async (code, kind) => {
    create.mockRejectedValueOnce(apiError(409, code));
    const { result } = await mount();
    await act(async () => {
      await result.current.join({ camera: false, listenOnly: false });
    });
    expect(result.current.failure).toMatchObject({ kind });
  });

  it('đang ở CHÍNH phòng này → quay lại màn phòng, không tạo/vào lần hai', async () => {
    callStoreApi.dispatch({ clientCallId: 'c', type: 'START_BEGIN' });
    callStoreApi.dispatch({ call: makeRoomCall(), joined: false, token, type: 'START_OK' });
    const { result } = await mount();
    let ok = false;
    await act(async () => {
      ok = await result.current.join({ camera: false, listenOnly: false });
    });
    expect(ok).toBe(true);
    expect(create).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith({ params: { callId: 'call1' }, pathname: '/call/[callId]' });
  });

  it('đang trong cuộc gọi KHÁC trên máy này → hỏi trước (không gọi API); xác nhận → rời cuộc gọi cũ rồi vào phòng với force', async () => {
    callStoreApi.dispatch({ clientCallId: 'c', type: 'START_BEGIN' });
    callStoreApi.dispatch({
      call: makeRoomCall({ id: 'dm1', mode: 'RING', scope: { avatarUrl: null, kind: 'DIRECT', title: 'Nam' }, scopeId: 'conv1', scopeType: 'CONVERSATION' }),
      joined: true,
      token,
      type: 'START_OK',
    });
    const { result } = await mount();
    await act(async () => {
      await result.current.join({ camera: false, listenOnly: false });
    });
    expect(result.current.switchPrompt).toMatchObject({ kind: 'OTHER_CALL', title: 'Nam' });
    expect(create).not.toHaveBeenCalled();

    create.mockResolvedValueOnce({ call: makeRoomCall(), joined: false, serverNow: 'x', token });
    await act(async () => {
      await result.current.confirmSwitch();
    });
    expect(callsService.leave).toHaveBeenCalledWith('dm1');
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ force: true, scopeId: 'ch1' }));
    expect(callStoreApi.get()).toMatchObject({ callId: 'call1', phase: 'connecting' });
  });

  it('lỗi mạng → failure OFFLINE, thử lại dùng LẠI cùng clientCallId (CL-09)', async () => {
    create.mockRejectedValueOnce(Object.assign(new Error('mạng'), { isAxiosError: true }));
    const { result } = await mount();
    await act(async () => {
      await result.current.join({ camera: false, listenOnly: false });
    });
    expect(result.current.failure).toMatchObject({ kind: 'OFFLINE' });
    const firstId = create.mock.calls[0]?.[0].clientCallId;

    create.mockResolvedValueOnce({ call: makeRoomCall(), joined: false, serverNow: 'x', token });
    await act(async () => {
      await result.current.join({ camera: false, listenOnly: false });
    });
    expect(create.mock.calls[1]?.[0].clientCallId).toBe(firstId);
  });
});
