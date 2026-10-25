import { act, renderHook } from '@testing-library/react-native';

import { showToast } from '@/shared/utils/toast.utils';
import { useAuthStore } from '@/shell/store/slices/auth';

import { REACTION_THROTTLE_MS } from '../constants/meeting-room.constants';
import { useMeetingReactions } from '../hooks/useMeetingReactions';
import { useRaiseHand } from '../hooks/useRaiseHand';
import { FakeMeetingMedia } from '../media/meeting-media.fake';
import { setMeetingMediaForTests } from '../media/meeting-media.registry';
import { meetingRoomApi } from '../store/meeting-room.store';
import { fakeParticipant } from './fixtures';

/** Giơ tay (attribute `handRaisedAt`) và cảm xúc (data topic, throttle 1 lần/giây) — app.md §2, §4.3. */
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

let media: FakeMeetingMedia;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  meetingRoomApi.reset();
  meetingRoomApi.patch({ meetingId: 'm1', phase: 'IN_ROOM', serverOffsetMs: 60_000 });
  useAuthStore.setState({ user: { id: 'me', name: 'Tôi' } as never });
  media = new FakeMeetingMedia();
  setMeetingMediaForTests(media);
});

afterEach(() => {
  meetingRoomApi.reset();
  setMeetingMediaForTests(null);
  jest.useRealTimers();
});

describe('useRaiseHand', () => {
  it('giơ tay: attribute là ISO theo GIỜ SERVER (đã cộng độ lệch); hạ tay xoá attribute', async () => {
    const { result } = await renderHook(() => useRaiseHand());
    expect(result.current.raised).toBe(false);

    await act(async () => result.current.toggle());
    expect(result.current.raised).toBe(true);
    expect(media.handRaisedAt).toBe(new Date(Date.now() + 60_000).toISOString());

    await act(async () => result.current.toggle());
    expect(result.current.raised).toBe(false);
    expect(media.handRaisedAt).toBeNull();
  });

  it('lỗi mạng dữ liệu: hoàn lại trạng thái cũ và báo', async () => {
    jest.spyOn(media, 'setHandRaised').mockRejectedValue(new Error('x'));
    const { result } = await renderHook(() => useRaiseHand());

    await act(async () => result.current.toggle());
    expect(result.current.raised).toBe(false);
    expect(showToast).toHaveBeenCalledWith('error', expect.stringContaining('giơ tay'));
  });
});

describe('useMeetingReactions', () => {
  it('gửi: thêm bản cục bộ (LiveKit không phát lại cho người gửi) và publish; trong 1 giây chỉ gửi một lần', async () => {
    const { result } = await renderHook(() => useMeetingReactions());

    await act(async () => result.current.send('👍'));
    await act(async () => result.current.send('👏'));
    expect(media.reactions).toEqual(['👍']);
    expect(result.current.reactions).toEqual([expect.objectContaining({ emoji: '👍', identity: 'me' })]);

    jest.advanceTimersByTime(REACTION_THROTTLE_MS + 1);
    await act(async () => result.current.send('🎉'));
    expect(media.reactions).toEqual(['👍', '🎉']);
  });

  it('lỗi gửi không đáng báo (cảm xúc tức thời); nameOf: "Bạn" cho mình, tên người khác, "Thành viên" khi không rõ', async () => {
    jest.spyOn(media, 'sendReaction').mockRejectedValue(new Error('x'));
    meetingRoomApi.patch({ participants: [fakeParticipant({ identity: 'u2', name: 'Lan' })] });
    const { result } = await renderHook(() => useMeetingReactions());

    await act(async () => result.current.send('👍'));
    expect(showToast).not.toHaveBeenCalled();
    expect(result.current.nameOf('me')).toBe('Bạn');
    expect(result.current.nameOf('u2')).toBe('Lan');
    expect(result.current.nameOf('u9')).toBe('Thành viên');
  });

  it('drop gỡ đúng một cảm xúc khỏi hàng đợi', async () => {
    meetingRoomApi.addReaction({ at: 1, emoji: '🎉', id: 'a', identity: 'u2' });
    meetingRoomApi.addReaction({ at: 2, emoji: '😮', id: 'b', identity: 'u2' });
    const { result } = await renderHook(() => useMeetingReactions());

    await act(async () => result.current.drop('a'));
    expect(result.current.reactions.map((r) => r.id)).toEqual(['b']);
  });
});
