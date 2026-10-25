import { act, renderHook } from '@testing-library/react-native';
import { router } from 'expo-router';
import { AccessibilityInfo, type GestureResponderEvent } from 'react-native';

import { CONTROLS_HIDE_AFTER_MS, useAutoHideControls, type AutoHideControls } from '../hooks/useAutoHideControls';
import { navigateOutOfRoom, useExitMeetingRoom } from '../hooks/useExitMeetingRoom';
import { FakeMeetingMedia } from '../media/meeting-media.fake';
import { setMeetingMediaForTests } from '../media/meeting-media.registry';
import { meetingRoomApi } from '../store/meeting-room.store';

/** Rời MÀN (phím Back/nút Thoát → dọn theo pha rồi điều hướng) và thanh điều khiển tự ẩn sau 5 giây khi xem chia sẻ (app.md §7). */
jest.mock('expo-router', () => ({ router: { back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn() } }));
jest.mock('@/core/media/permissions', () => ({
  ensureCameraPermission: jest.fn(() => Promise.resolve('granted')),
  ensureMicrophonePermission: jest.fn(() => Promise.resolve('granted')),
  openAppSettings: jest.fn(),
}));
jest.mock('../api/meeting-room.service', () => ({ meetingRoomService: { leave: jest.fn(), snapshot: jest.fn() } }));
jest.mock('../api/meeting-room-host.service', () => ({ meetingRoomHostService: { cancelMyRequest: jest.fn() } }));

/** Sự kiện chạm THÔ giả (chỉ các trường hook đọc): toạ độ trang + số ngón đang chạm. */
const touchAt = (pageX: number, pageY: number, fingers = 1) =>
  ({ nativeEvent: { pageX, pageY, touches: Array.from({ length: fingers }, () => ({})) } }) as unknown as GestureResponderEvent;

/** Một cú gõ lên sân khấu như trên máy: `touchStart` của khung sân khấu → `reveal` của lớp ngoài (cùng sự kiện, nổi bọt) → `touchEnd`. */
function tapStage(controls: AutoHideControls): void {
  controls.stageTouch.onTouchStart(touchAt(20, 20));
  controls.reveal();
  controls.stageTouch.onTouchEnd(touchAt(22, 21));
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.mocked(router.canGoBack).mockReturnValue(true);
  meetingRoomApi.reset();
  setMeetingMediaForTests(new FakeMeetingMedia());
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
});

afterEach(() => {
  meetingRoomApi.reset();
  setMeetingMediaForTests(null);
  jest.useRealTimers();
});

describe('useExitMeetingRoom / navigateOutOfRoom', () => {
  it('pre-join: dọn store rồi quay lại màn trước', async () => {
    meetingRoomApi.patch({ meetingId: 'm1', phase: 'PREJOIN' });
    const { result } = await renderHook(() => useExitMeetingRoom());

    await act(async () => result.current());
    expect(meetingRoomApi.get().meetingId).toBeNull();
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('đang trong phòng: KHÔNG bỏ phiên — chỉ thu nhỏ rồi rời màn', async () => {
    meetingRoomApi.patch({ meetingId: 'm1', phase: 'IN_ROOM' });
    const { result } = await renderHook(() => useExitMeetingRoom());

    await act(async () => result.current());
    expect(meetingRoomApi.get()).toMatchObject({ meetingId: 'm1', minimized: true, phase: 'IN_ROOM' });
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('không còn lịch sử (mở từ deep link/MiniBar) → về chi tiết cuộc họp; không biết cuộc họp → trang chủ', () => {
    jest.mocked(router.canGoBack).mockReturnValue(false);
    navigateOutOfRoom('m1');
    expect(router.replace).toHaveBeenLastCalledWith({ params: { meetingId: 'm1' }, pathname: '/meetings/[meetingId]' });
    navigateOutOfRoom(null);
    expect(router.replace).toHaveBeenLastCalledWith('/');
  });
});

describe('useAutoHideControls', () => {
  it(`chỉ ẩn khi đang xem chia sẻ, sau ${CONTROLS_HIDE_AFTER_MS / 1000} giây; chạm (reveal) hiện lại rồi đếm lại`, async () => {
    const { result, rerender } = await renderHook(({ active }: { active: boolean }) => useAutoHideControls(active, false), { initialProps: { active: false } });
    await act(async () => jest.advanceTimersByTimeAsync(CONTROLS_HIDE_AFTER_MS + 100));
    expect(result.current.hidden).toBe(false); // không chia sẻ → không bao giờ ẩn

    await rerender({ active: true });
    await act(async () => jest.advanceTimersByTimeAsync(CONTROLS_HIDE_AFTER_MS - 100));
    expect(result.current.hidden).toBe(false);
    await act(async () => jest.advanceTimersByTimeAsync(200));
    expect(result.current.hidden).toBe(true);

    await act(async () => result.current.reveal());
    expect(result.current.hidden).toBe(false);
    await act(async () => jest.advanceTimersByTimeAsync(CONTROLS_HIDE_AFTER_MS + 100));
    expect(result.current.hidden).toBe(true);
  });

  it('gõ lên sân khấu (`tapToHide`, Meet): ẩn; gõ lần nữa: hiện — chính cú "chạm để hiện" không ẩn lại khi nhấc tay', async () => {
    const { result } = await renderHook(() => useAutoHideControls(false, false, true));

    await act(async () => tapStage(result.current));
    expect(result.current.hidden).toBe(true);
    await act(async () => tapStage(result.current));
    expect(result.current.hidden).toBe(false);
  });

  it('nhấn giữ (ghim ô), vuốt (đổi trang), hai ngón (phóng), chạm bị huỷ — KHÔNG phải cú gõ, thanh đứng yên', async () => {
    const { result } = await renderHook(() => useAutoHideControls(false, false, true));
    const stage = () => result.current.stageTouch;

    await act(async () => {
      stage().onTouchStart(touchAt(10, 10));
      jest.advanceTimersByTime(600);
      stage().onTouchEnd(touchAt(10, 10));
    });
    await act(async () => {
      stage().onTouchStart(touchAt(10, 10));
      stage().onTouchEnd(touchAt(80, 12));
    });
    await act(async () => {
      stage().onTouchStart(touchAt(10, 10, 2));
      stage().onTouchEnd(touchAt(10, 10));
    });
    await act(async () => {
      stage().onTouchStart(touchAt(10, 10));
      stage().onTouchCancel();
      stage().onTouchEnd(touchAt(10, 10));
    });
    expect(result.current.hidden).toBe(false);
  });

  it('gõ-để-ẩn tắt (đang chia sẻ / chỉ có mình) thì gõ không ẩn; có sheet mở hoặc trình đọc màn hình thì cũng không', async () => {
    const off = await renderHook(() => useAutoHideControls(false, false, false));
    await act(async () => tapStage(off.result.current));
    expect(off.result.current.hidden).toBe(false);

    const sheet = await renderHook(() => useAutoHideControls(false, true, true));
    await act(async () => tapStage(sheet.result.current));
    expect(sheet.result.current.hidden).toBe(false);

    jest.mocked(AccessibilityInfo.isScreenReaderEnabled).mockResolvedValue(true);
    const reader = await renderHook(() => useAutoHideControls(false, false, true));
    await act(async () => jest.advanceTimersByTimeAsync(0));
    await act(async () => tapStage(reader.result.current));
    expect(reader.result.current.hidden).toBe(false);
  });

  it('đã gõ ẩn rồi mở sheet: thanh hiện ngay, đóng sheet xong VẪN hiện (lần ẩn cũ bị quên)', async () => {
    const { result, rerender } = await renderHook(({ blocked }: { blocked: boolean }) => useAutoHideControls(false, blocked, true), {
      initialProps: { blocked: false },
    });
    await act(async () => tapStage(result.current));
    expect(result.current.hidden).toBe(true);

    await rerender({ blocked: true });
    expect(result.current.hidden).toBe(false);
    await rerender({ blocked: false });
    expect(result.current.hidden).toBe(false);
  });

  it('không ẩn khi có sheet mở, hoặc trình đọc màn hình (TalkBack/VoiceOver) đang bật', async () => {
    const opened = await renderHook(() => useAutoHideControls(true, true));
    await act(async () => jest.advanceTimersByTimeAsync(CONTROLS_HIDE_AFTER_MS * 2));
    expect(opened.result.current.hidden).toBe(false);

    jest.mocked(AccessibilityInfo.isScreenReaderEnabled).mockResolvedValue(true);
    const reader = await renderHook(() => useAutoHideControls(true, false));
    await act(async () => jest.advanceTimersByTimeAsync(CONTROLS_HIDE_AFTER_MS * 2));
    expect(reader.result.current.hidden).toBe(false);
  });
});
