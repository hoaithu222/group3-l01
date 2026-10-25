import { act, renderHook } from '@testing-library/react-native';

import { ensureCameraPermission, ensureMicrophonePermission } from '@/core/media/permissions';

import { usePreJoinDevices } from '../hooks/usePreJoinDevices';
import { FakeMeetingMedia } from '../media/meeting-media.fake';
import { setMeetingMediaForTests } from '../media/meeting-media.registry';
import { meetingRoomApi } from '../store/meeting-room.store';

/**
 * Thiết bị ở pre-join (app.md §3.2, §7): mic/camera MẶC ĐỊNH TẮT; bật thì xin quyền đúng lúc đó (bị từ chối chỉ ghi cờ, không chặn vào họp);
 * xem trước camera chỉ chạy khi camera bật và dừng khi rời pre-join; đổi camera trước/sau khởi động lại xem trước.
 */
jest.mock('@/core/media/permissions', () => ({
  ensureCameraPermission: jest.fn(() => Promise.resolve('granted')),
  ensureMicrophonePermission: jest.fn(() => Promise.resolve('granted')),
  openAppSettings: jest.fn(),
}));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../hooks/useMicLevel', () => ({ useMicLevel: jest.fn(() => 0) }));

let media: FakeMeetingMedia;

beforeEach(() => {
  jest.clearAllMocks();
  meetingRoomApi.reset();
  media = new FakeMeetingMedia();
  setMeetingMediaForTests(media);
});

afterEach(() => {
  meetingRoomApi.reset();
  setMeetingMediaForTests(null);
});

describe('usePreJoinDevices', () => {
  it('mặc định mic/camera TẮT, chưa xin quyền, chưa mở xem trước', async () => {
    const { result } = await renderHook(() => usePreJoinDevices(true));

    expect(result.current.prefs).toMatchObject({ cam: false, listenOnly: false, mic: false });
    expect(result.current.previewRef).toBeNull();
    expect(ensureMicrophonePermission).not.toHaveBeenCalled();
    expect(ensureCameraPermission).not.toHaveBeenCalled();
    expect(media.previewCalls).toBe(0);
  });

  it('bật mic: xin quyền lúc bấm rồi bật; tắt lại thì không xin nữa', async () => {
    const { result } = await renderHook(() => usePreJoinDevices(true));

    await act(async () => result.current.toggleMic());
    expect(ensureMicrophonePermission).toHaveBeenCalledTimes(1);
    expect(result.current.prefs.mic).toBe(true);

    await act(async () => result.current.toggleMic());
    expect(result.current.prefs.mic).toBe(false);
    expect(ensureMicrophonePermission).toHaveBeenCalledTimes(1);
  });

  it('bị từ chối quyền: giữ TẮT + ghi cờ để hiện dòng nhắc (vẫn vào họp được)', async () => {
    jest.mocked(ensureMicrophonePermission).mockResolvedValueOnce('denied');
    jest.mocked(ensureCameraPermission).mockResolvedValueOnce('denied');
    const { result } = await renderHook(() => usePreJoinDevices(true));

    await act(async () => result.current.toggleMic());
    await act(async () => result.current.toggleCam());

    expect(result.current).toMatchObject({ camDenied: true, micDenied: true });
    expect(result.current.prefs).toMatchObject({ cam: false, mic: false });
    expect(media.previewCalls).toBe(0);
  });

  it('bật camera: mở xem trước (mảnh mờ đục cho renderVideo); đổi camera → mở lại với mặt kia; tắt → dừng', async () => {
    const { result } = await renderHook(() => usePreJoinDevices(true));

    await act(async () => result.current.toggleCam());
    expect(ensureCameraPermission).toHaveBeenCalledTimes(1);
    expect(media.previewing).toBe(true);
    expect(result.current.previewRef).toEqual({ preview: true });

    const startPreview = jest.spyOn(media, 'startPreview');
    await act(async () => result.current.flipCamera());
    expect(result.current.prefs.facing).toBe('back');
    expect(startPreview).toHaveBeenCalledWith('back');

    await act(async () => result.current.toggleCam());
    expect(media.previewing).toBe(false);
    expect(result.current.previewRef).toBeNull();
  });

  it('rời pre-join (active=false) → dừng xem trước NGAY, không giữ đèn camera', async () => {
    meetingRoomApi.patch({ preJoin: { ...meetingRoomApi.get().preJoin, cam: true } });
    const { rerender } = await renderHook(({ active }: { active: boolean }) => usePreJoinDevices(active), { initialProps: { active: true } });
    expect(media.previewing).toBe(true);

    await rerender({ active: false });
    expect(media.previewing).toBe(false);
  });

  it('"chỉ để nghe" tắt cả mic lẫn camera và không mở xem trước; đổi tên và loa được lưu vào store', async () => {
    const { result } = await renderHook(() => usePreJoinDevices(true));

    await act(async () => result.current.toggleMic());
    await act(async () => result.current.chooseListenOnly());
    expect(result.current.prefs).toMatchObject({ cam: false, listenOnly: true, mic: false });

    await act(async () => result.current.setDisplayName('Lan Anh'));
    await act(async () => result.current.toggleSpeaker());
    expect(meetingRoomApi.get().preJoin.displayName).toBe('Lan Anh');
    expect(meetingRoomApi.get().speakerOn).toBe(false);
  });

  it('tắt camera khi xem trước CHƯA mở xong → track về muộn bị dừng ngay (không sáng đèn camera ngầm)', async () => {
    let resolveStart: (ref: unknown) => void = () => undefined;
    jest.spyOn(media, 'startPreview').mockImplementation(() => new Promise((resolve) => (resolveStart = resolve)));
    const stopPreview = jest.spyOn(media, 'stopPreview');
    const { result } = await renderHook(() => usePreJoinDevices(true));

    await act(async () => result.current.toggleCam()); // bật → đang mở
    await act(async () => result.current.toggleCam()); // tắt trước khi mở xong
    stopPreview.mockClear();
    await act(async () => resolveStart({ preview: 'muon' }));

    expect(stopPreview).toHaveBeenCalledTimes(1);
    expect(result.current.previewRef).toBeNull();
  });

  it('đổi camera khi lượt mở trước chưa xong: lượt mới CHỜ lượt cũ (không hai track chồng nhau)', async () => {
    const starts: ((ref: unknown) => void)[] = [];
    const startPreview = jest
      .spyOn(media, 'startPreview')
      .mockImplementation(() => new Promise((resolve) => starts.push(resolve)));
    const { result } = await renderHook(() => usePreJoinDevices(true));

    await act(async () => result.current.toggleCam());
    await act(async () => result.current.flipCamera());
    expect(startPreview).toHaveBeenCalledTimes(1);

    await act(async () => starts[0]?.({ preview: 'front' }));
    expect(startPreview).toHaveBeenLastCalledWith('back');
    await act(async () => starts[1]?.({ preview: 'back' }));
    expect(result.current.previewRef).toEqual({ preview: 'back' });
  });

  it('xem trước lỗi (không mở được camera) → tự tắt công tắc camera, không kẹt', async () => {
    jest.spyOn(media, 'startPreview').mockRejectedValue(new Error('no camera'));
    const { result } = await renderHook(() => usePreJoinDevices(true));

    await act(async () => result.current.toggleCam());
    expect(result.current.prefs.cam).toBe(false);
    expect(result.current.previewRef).toBeNull();
  });
});
