import { act, renderHook } from '@testing-library/react-native';

import { ensureMicrophonePermission } from '@/core/media/permissions';
import { showToast } from '@/shared/utils/toast.utils';

import { useMeetingControls } from '../hooks/useMeetingControls';
import { FakeMeetingMedia } from '../media/meeting-media.fake';
import { setMeetingMediaForTests } from '../media/meeting-media.registry';
import { meetingRoomApi } from '../store/meeting-room.store';

/**
 * Thiết bị của mình trong phòng (app.md §3.2, §7): nút bật/tắt theo track THẬT do cổng media báo lại; bật mic xin quyền đúng lúc bấm, không
 * quyền publish thì báo rõ; chia sẻ màn hình ẩn khi thiết bị không hỗ trợ; mở Chat = đã đọc.
 */
jest.mock('@/core/media/permissions', () => ({
  ensureCameraPermission: jest.fn(() => Promise.resolve('granted')),
  ensureMicrophonePermission: jest.fn(() => Promise.resolve('granted')),
  openAppSettings: jest.fn(),
}));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

let media: FakeMeetingMedia;

beforeEach(() => {
  jest.clearAllMocks();
  meetingRoomApi.reset();
  meetingRoomApi.patch({ meetingId: 'm1', phase: 'IN_ROOM' });
  media = new FakeMeetingMedia();
  setMeetingMediaForTests(media);
});

afterEach(() => {
  meetingRoomApi.reset();
  setMeetingMediaForTests(null);
});

describe('useMeetingControls', () => {
  it('bật mic: xin quyền → bật thật → nút theo track; tắt không xin lại', async () => {
    const { result } = await renderHook(() => useMeetingControls());

    await act(async () => result.current.toggleMic());
    expect(ensureMicrophonePermission).toHaveBeenCalledTimes(1);
    expect(media.mic).toBe(true);
    expect(result.current.micOn).toBe(true);

    await act(async () => result.current.toggleMic());
    expect(media.mic).toBe(false);
    expect(result.current.micOn).toBe(false);
    expect(ensureMicrophonePermission).toHaveBeenCalledTimes(1);
  });

  it('bị từ chối quyền → KHÔNG bật; token chỉ cho nghe → báo rõ, không gọi cổng media', async () => {
    jest.mocked(ensureMicrophonePermission).mockResolvedValueOnce('denied');
    const { result } = await renderHook(() => useMeetingControls());

    await act(async () => result.current.toggleMic());
    expect(media.mic).toBe(false);
    expect(result.current.micOn).toBe(false);

    await act(async () => meetingRoomApi.patch({ publish: { audio: false, screen: false, video: false } }));
    await act(async () => result.current.toggleMic());
    expect(showToast).toHaveBeenCalledWith('info', expect.stringContaining('chỉ có quyền nghe'));
    await act(async () => result.current.toggleCamera());
    expect(showToast).toHaveBeenCalledWith('info', expect.stringContaining('không có quyền bật camera'));
    expect(media.camera).toBe(false);
  });

  it('bật camera + đổi camera + loa ngoài/trong', async () => {
    const { result } = await renderHook(() => useMeetingControls());

    await act(async () => result.current.toggleCamera());
    expect(result.current.camOn).toBe(true);
    await act(async () => result.current.flipCamera());
    expect(media.flipCalls).toBe(1);

    await act(async () => result.current.toggleSpeaker());
    expect(media.speakerOn).toBe(false);
    expect(result.current.speakerOn).toBe(false);
  });

  it('chia sẻ màn hình: chỉ khi CÓ quyền và thiết bị hỗ trợ; bật/tắt theo kết quả thật', async () => {
    const { result, rerender } = await renderHook(() => useMeetingControls());
    expect(result.current.canScreenShare).toBe(true);

    await act(async () => result.current.toggleScreenShare());
    expect(media.screenShare).toBe(true);
    expect(result.current.screenSharing).toBe(true);
    await act(async () => result.current.toggleScreenShare());
    expect(result.current.screenSharing).toBe(false);

    media.screenShareSupported = false; // iOS: chưa có Broadcast Extension
    await rerender({});
    expect(result.current.canScreenShare).toBe(false);

    media.screenShareSupported = true;
    await act(async () => meetingRoomApi.patch({ publish: { audio: true, screen: false, video: true } }));
    await rerender({});
    expect(result.current.canScreenShare).toBe(false);
  });

  it('sheet: mở Chat xoá badge chưa đọc; đổi bố cục về trang đầu; ghim/bỏ ghim cục bộ', async () => {
    meetingRoomApi.patch({ chatUnread: 3, page: 2 });
    const { result } = await renderHook(() => useMeetingControls());

    await act(async () => result.current.openSheet('CHAT'));
    expect(meetingRoomApi.get()).toMatchObject({ chatUnread: 0, sheet: 'CHAT' });
    await act(async () => result.current.closeSheet());
    expect(meetingRoomApi.get().sheet).toBe('NONE');

    await act(async () => result.current.setLayout('SPEAKER'));
    expect(meetingRoomApi.get()).toMatchObject({ layout: 'SPEAKER', page: 0 });

    await act(async () => result.current.togglePin('u2'));
    expect(meetingRoomApi.get().pinnedUserId).toBe('u2');
    await act(async () => result.current.togglePin(null));
    expect(meetingRoomApi.get().pinnedUserId).toBeNull();
  });

  it('bấm dồn mic khi đang xử lý: chỉ một lượt (cờ bận)', async () => {
    let finish: (value: boolean) => void = () => undefined;
    jest.spyOn(media, 'setMicrophoneEnabled').mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = await renderHook(() => useMeetingControls());

    let first: Promise<void> = Promise.resolve();
    await act(async () => {
      first = result.current.toggleMic();
    });
    expect(result.current.micBusy).toBe(true);
    await act(async () => result.current.toggleMic());
    expect(media.setMicrophoneEnabled).toHaveBeenCalledTimes(1);

    await act(async () => {
      finish(true);
      await first;
    });
    expect(result.current).toMatchObject({ micBusy: false, micOn: true });
  });
});
