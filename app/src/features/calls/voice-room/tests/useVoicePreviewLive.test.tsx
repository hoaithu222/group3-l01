import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useRoomSubscription } from '@/core/socket';

import type { CallEndedPayload, CallParticipantPublicPayload } from '../../api/calls.socket.types';
import { voiceRoomKeys } from '../api/voice-room.keys';
import type { VoicePreview } from '../api/voice-room.types';
import { useVoicePreviewLive } from '../hooks/useVoicePreviewLive';
import { makePreview, makePreviewParticipant } from './helpers';

/** `useVoicePreviewLive` (app.md §4, §8): vào room `ch:{id}`, vá preview theo bản công khai, bỏ bản đầy đủ của phiên mình, `call:ended` xoá phòng, đối soát có trễ. */
const mockHandlers = new Map<string, (payload: unknown) => void>();
jest.mock('@/core/socket', () => ({
  SocketEvent: jest.requireActual('@/core/socket/socket.events').SocketEvent,
  useRoomSubscription: jest.fn(() => ({ status: 'joined' })),
  useSocketEvent: (event: string, handler: (payload: unknown) => void) => {
    mockHandlers.set(event, handler);
  },
}));

const KEY = voiceRoomKeys.preview('ch1');
const base = { serverNow: '2026-09-25T10:00:00.000Z', v: 1 as const };
const inRoom = (): VoicePreview =>
  makePreview({
    call: { hostId: 'host', id: 'call1', startedAt: '2026-09-25T10:00:00.000Z', version: 2 },
    participants: [makePreviewParticipant({ isHost: true, userId: 'host' })],
    seatsLeft: 7,
  });
const joined: CallParticipantPublicPayload = {
  ...base,
  callId: 'call1',
  count: 2,
  participant: { avatarUrl: null, cameraEnabled: true, handRaisedAt: null, isHost: false, micEnabled: true, name: 'Lan', sharingScreen: false, state: 'CONNECTED', userId: 'lan' },
  version: 2,
};
const ended: CallEndedPayload = { ...base, callId: 'call1', durationSec: 60, endReason: 'HOST_ENDED', version: 3 };

async function mount() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
  queryClient.setQueryData<VoicePreview>(KEY, inRoom());
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  const hook = await renderHook(() => useVoicePreviewLive('ch1'), { wrapper });
  return { ...hook, invalidate, queryClient };
}
const emit = (event: string, payload: unknown) => act(() => mockHandlers.get(event)?.(payload));

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockHandlers.clear();
});
afterEach(() => jest.useRealTimers());

describe('useVoicePreviewLive', () => {
  it('vào room `ch:{id}` khi mở preview', async () => {
    await mount();
    expect(useRoomSubscription).toHaveBeenCalledWith('ch', 'ch1');
  });

  it('bản công khai của call:participant-updated → vá người vào + số chỗ, rồi đối soát với server sau một nhịp ngắn', async () => {
    const { invalidate, queryClient } = await mount();
    await emit('call:participant-updated', joined);

    const patched = queryClient.getQueryData<VoicePreview>(KEY);
    expect(patched?.participants.map((p) => p.userId)).toEqual(['host', 'lan']);
    expect(patched?.seatsLeft).toBe(6);
    expect(invalidate).not.toHaveBeenCalled(); // chưa tới nhịp đối soát

    await act(async () => jest.advanceTimersByTime(1500));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: KEY });
  });

  it('nhiều sự kiện dồn dập chỉ đối soát MỘT lần (gom theo nhịp)', async () => {
    const { invalidate } = await mount();
    await emit('call:participant-updated', joined);
    await emit('call:participant-updated', { ...joined, participant: { ...joined.participant, handRaisedAt: '2026-09-25T10:01:00.000Z' } });
    await act(async () => jest.advanceTimersByTime(1600));
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('bản ĐẦY ĐỦ của phiên mình đang ở (có `role`, room `call:{id}`) bị bỏ qua', async () => {
    const { invalidate, queryClient } = await mount();
    await emit('call:participant-updated', { ...base, callId: 'call1', participant: { handRaisedAt: null, mutedByHost: false, role: 'MEMBER', state: 'CONNECTED', userId: 'lan' }, version: 2 });
    expect(queryClient.getQueryData<VoicePreview>(KEY)?.participants).toHaveLength(1);
    await act(async () => jest.advanceTimersByTime(3000));
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('call:ended của phòng đang xem → phòng trống ngay, rồi hỏi lại server (lý do kết thúc đổi myActions)', async () => {
    const { invalidate, queryClient } = await mount();
    await emit('call:ended', ended);
    expect(queryClient.getQueryData<VoicePreview>(KEY)).toMatchObject({ call: null, participants: [], seatsLeft: 8 });
    await act(async () => jest.advanceTimersByTime(1500));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: KEY });
  });

  it('call:ended của phiên khác → không đụng vào preview', async () => {
    const { queryClient } = await mount();
    await emit('call:ended', { ...ended, callId: 'khac' });
    expect(queryClient.getQueryData<VoicePreview>(KEY)?.call?.id).toBe('call1');
  });

  it('chưa có preview trong cache → không vá (tránh dựng dữ liệu thiếu)', async () => {
    const { queryClient } = await mount();
    queryClient.removeQueries({ queryKey: KEY });
    await emit('call:participant-updated', joined);
    expect(queryClient.getQueryData(KEY)).toBeUndefined();
  });

  it('gỡ màn hình → huỷ hẹn giờ đối soát (không invalidate sau khi unmount)', async () => {
    const { invalidate, unmount } = await mount();
    await emit('call:participant-updated', joined);
    await unmount();
    await act(async () => jest.advanceTimersByTime(5000));
    expect(invalidate).not.toHaveBeenCalled();
  });
});
