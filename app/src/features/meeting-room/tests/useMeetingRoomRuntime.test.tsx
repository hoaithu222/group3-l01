import { act, renderHook } from '@testing-library/react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import * as socket from '@/core/socket';
import { showToast } from '@/shared/utils/toast.utils';
import { useAuthStore } from '@/shell/store/slices/auth';

import { MeetingRoomEvent } from '../api/meeting-room.socket';
import { useHostMounted, useRegisterHost } from '../hooks/use-runtime-owner';
import { useMeetingRoomRuntime } from '../hooks/useMeetingRoomRuntime';
import { FakeMeetingMedia } from '../media/meeting-media.fake';
import { setMeetingMediaForTests } from '../media/meeting-media.registry';
import { meetingRoomApi } from '../store/meeting-room.store';
import { flushMicrotasks } from './hook-wrapper';

/**
 * Runtime toàn cục của phòng họp (app.md §4.3, §6): nối socket vào handler, hai phòng Socket.IO (`meet:`/`call:`), giữ màn sáng; CHỈ MỘT bản
 * chạy khi cả `MeetingRoomHost` và màn phòng cùng mount (không xử lý một sự kiện hai lần).
 */
type Handler = (payload: unknown) => void;
/** Chỉ hai hook của React mà mock `useSocketEvent` cần (không dùng `typeof import()`). */
interface ReactHooks {
  useEffect: (effect: () => (() => void) | void, deps: unknown[]) => void;
  useRef: <T>(value: T) => { current: T };
}
jest.mock('@/core/socket', () => {
  const react = jest.requireActual<ReactHooks>('react');
  const handlers = new Map<string, Set<Handler>>();
  return {
    SocketEvent: jest.requireActual('@/core/socket/socket.events').SocketEvent,
    handlers,
    onRoomResync: jest.fn(() => () => undefined),
    useRoomSubscription: jest.fn(),
    useSocketEvent: (event: string, handler: Handler) => {
      const latest = react.useRef(handler);
      latest.current = handler;
      react.useEffect(() => {
        const listener: Handler = (payload) => latest.current(payload);
        const set = handlers.get(event) ?? new Set<Handler>();
        handlers.set(event, set.add(listener));
        return () => void set.delete(listener);
      }, [event]);
    },
  };
});
jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: jest.fn(() => Promise.resolve()), deactivateKeepAwake: jest.fn(() => Promise.resolve()) }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

const handlers = (socket as unknown as { handlers: Map<string, Set<Handler>> }).handlers;
const subscription = jest.mocked(socket.useRoomSubscription);
const emit = (event: string, payload: unknown) => act(async () => handlers.get(event)?.forEach((handler) => handler(payload)));

beforeEach(() => {
  jest.clearAllMocks();
  handlers.clear();
  meetingRoomApi.reset();
  useAuthStore.setState({ user: { id: 'me', name: 'Tôi' } as never });
  setMeetingMediaForTests(new FakeMeetingMedia());
});

afterEach(() => {
  meetingRoomApi.reset();
  setMeetingMediaForTests(null);
});

describe('phòng Socket.IO + giữ màn sáng', () => {
  it('có phiên: vào `meet:{id}` ngay từ pre-join; `call:{id}` chỉ khi đã nối phòng; kết thúc thì rời cả hai', async () => {
    meetingRoomApi.patch({ meetingId: 'm1', phase: 'PREJOIN' });
    await renderHook(() => useMeetingRoomRuntime());
    expect(subscription).toHaveBeenLastCalledWith('call', null, { enabled: false });
    expect(subscription).toHaveBeenCalledWith('meet', 'm1', { enabled: true });

    await act(async () => meetingRoomApi.patch({ callId: 'call1', phase: 'IN_ROOM' }));
    expect(subscription).toHaveBeenLastCalledWith('call', 'call1', { enabled: true });

    await act(async () => meetingRoomApi.patch({ phase: 'ENDED' }));
    expect(subscription).toHaveBeenCalledWith('meet', 'm1', { enabled: false });
    expect(subscription).toHaveBeenLastCalledWith('call', 'call1', { enabled: false });
  });

  it('giữ màn sáng khi IN_ROOM/RECONNECTING; nhả khi ra khỏi phòng', async () => {
    meetingRoomApi.patch({ meetingId: 'm1', phase: 'PREJOIN' });
    await renderHook(() => useMeetingRoomRuntime());
    expect(activateKeepAwakeAsync).not.toHaveBeenCalled();

    await act(async () => meetingRoomApi.patch({ phase: 'IN_ROOM' }));
    expect(activateKeepAwakeAsync).toHaveBeenCalledTimes(1);
    await act(async () => meetingRoomApi.patch({ phase: 'RECONNECTING' }));
    expect(activateKeepAwakeAsync).toHaveBeenCalledTimes(1); // vẫn giữ, không kích hoạt lại

    await act(async () => meetingRoomApi.patch({ phase: 'ENDED' }));
    expect(deactivateKeepAwake).toHaveBeenCalled();
  });
});

describe('sự kiện socket → phòng', () => {
  beforeEach(() => meetingRoomApi.patch({ callId: 'call1', meetingId: 'm1', phase: 'IN_ROOM', role: 'HOST' }));

  it('meeting:ended / call:host-action REMOVED / permission:revoked → đúng pha kết thúc', async () => {
    await renderHook(() => useMeetingRoomRuntime());

    await emit(MeetingRoomEvent.ENDED, { callId: 'call1', durationSec: 90, meetingId: 'm1', reason: 'HOST_ENDED' });
    await flushMicrotasks();
    expect(meetingRoomApi.get()).toMatchObject({ endedReason: 'HOST_ENDED', phase: 'ENDED' });

    await act(async () => meetingRoomApi.patch({ phase: 'IN_ROOM' }));
    await emit(MeetingRoomEvent.HOST_ACTION, { byUserId: 'h', callId: 'call1', targetUserId: 'me', type: 'REMOVED' });
    await flushMicrotasks();
    expect(meetingRoomApi.get().phase).toBe('REMOVED');

    await act(async () => meetingRoomApi.patch({ phase: 'IN_ROOM' }));
    await emit(socket.SocketEvent.PERMISSION_REVOKED, { cascade: false, reason: 'REMOVED', scopeId: 'm1', scopeType: 'MEETING', v: 1, version: 3 });
    await flushMicrotasks();
    expect(meetingRoomApi.get()).toMatchObject({ blockedCode: 'GONE', phase: 'BLOCKED' });
  });

  it('meeting:updated (khoá phòng) + tin chat mới của người khác → store', async () => {
    meetingRoomApi.patch({ conversationId: 'conv1' });
    await renderHook(() => useMeetingRoomRuntime());

    await emit(socket.SocketEvent.MEETING_UPDATED, { changedFields: ['lockedAt'], lockedAt: '2026-10-01T09:10:00.000Z', meetingId: 'm1', version: 5 });
    await emit(socket.SocketEvent.MESSAGE_CREATED, { authorId: 'u2', scopeId: 'conv1', scopeType: 'CONVERSATION' });
    expect(meetingRoomApi.get()).toMatchObject({ chatUnread: 1, lockedAt: '2026-10-01T09:10:00.000Z' });
  });

  it('đăng ký nghe socket nối lại (onRoomResync) khi là bản chủ', async () => {
    await renderHook(() => useMeetingRoomRuntime());
    expect(socket.onRoomResync).toHaveBeenCalledTimes(1);
  });
});

describe('chỉ MỘT bản chạy runtime (Host + màn phòng cùng mount)', () => {
  const lobby = { displayName: 'Bình', lobbyCount: 1, meetingId: 'm1', state: 'REQUESTED', userId: 'u2' };

  it('hai bản cùng mount: sự kiện chỉ xử lý MỘT lần; bản chủ gỡ thì bản kia lên thay', async () => {
    meetingRoomApi.patch({ callId: 'call1', meetingId: 'm1', phase: 'IN_ROOM' });
    const host = await renderHook(() => useMeetingRoomRuntime());
    await renderHook(() => useMeetingRoomRuntime());
    await flushMicrotasks();

    await emit(MeetingRoomEvent.LOBBY, lobby);
    expect(showToast).toHaveBeenCalledTimes(1);

    await host.unmount();
    await act(async () => meetingRoomApi.patch({ lobby: [] }));
    await emit(MeetingRoomEvent.LOBBY, lobby);
    expect(showToast).toHaveBeenCalledTimes(2);
  });

  it('useRegisterHost/useHostMounted: nút "Thu nhỏ" chỉ bật khi có Host', async () => {
    const seen = await renderHook(() => useHostMounted());
    expect(seen.result.current).toBe(false);

    const host = await renderHook(() => useRegisterHost());
    expect(seen.result.current).toBe(true);

    await host.unmount();
    expect(seen.result.current).toBe(false);
  });
});
