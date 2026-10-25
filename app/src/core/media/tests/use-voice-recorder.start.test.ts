import { act, renderHook } from '@testing-library/react-native';

import { useVoiceRecorder, type VoiceRecordResult } from '../use-voice-recorder';

/**
 * Vòng đời `start()` của `useVoiceRecorder` — mock `expo-audio` (`__mocks__/expo-audio.ts`) mô phỏng ĐÚNG native:
 * `record()` chỉ chạy khi đã `prepareToRecordAsync()`. Bản mock cũ cho `record()` chạy vô điều kiện nên thiếu bước chuẩn bị
 * mà test vẫn xanh, còn máy thật thì "đã cấp quyền micro nhưng không ghi được gì".
 */
const audioMock = jest.requireMock<{
  fakeRecorderControl: { failPrepare: boolean; prepareGate: Promise<void> | null };
  requestRecordingPermissionsAsync: jest.Mock;
}>('expo-audio');

/** Cho các `await` nối tiếp của `start()` (quyền → chế độ âm thanh → chuẩn bị) chạy tới điểm chờ kế tiếp. */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

/** Chặn bước chuẩn bị tới khi gọi hàm trả về — mô phỏng chuẩn bị chậm (người dùng có thể thả tay giữa chừng). */
function gatePrepare(): () => void {
  let open!: () => void;
  audioMock.fakeRecorderControl.prepareGate = new Promise<void>((resolve) => {
    open = resolve;
  });
  return open;
}

describe('useVoiceRecorder — start()', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    audioMock.fakeRecorderControl.failPrepare = false;
    audioMock.fakeRecorderControl.prepareGate = null;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('CHUẨN BỊ recorder rồi mới ghi — native chỉ chạy record() khi đã prepare (thiếu bước này mic "cấp quyền mà không ghi")', async () => {
    const { result } = await renderHook(() => useVoiceRecorder());

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.start();
    });

    expect(outcome).toBe('started');
    expect(result.current.isRecording).toBe(true);
    expect(result.current.phase).toBe('recording');
  });

  it('ghi lượt thứ hai sau khi dừng vẫn chạy (mỗi lượt phải chuẩn bị lại vì stop() reset recorder)', async () => {
    const { result } = await renderHook(() => useVoiceRecorder());

    for (let round = 0; round < 2; round += 1) {
      let outcome: string | undefined;
      await act(async () => {
        outcome = await result.current.start();
      });
      expect(outcome).toBe('started');
      await act(async () => {
        jest.advanceTimersByTime(1500);
      });
      const capture: { stopped: VoiceRecordResult | null } = { stopped: null };
      await act(async () => {
        capture.stopped = await result.current.stop();
      });
      expect(capture.stopped?.uri).toBeTruthy();
    }
  });

  it('thiếu quyền micro ⇒ permission-blocked, KHÔNG ghi', async () => {
    audioMock.requestRecordingPermissionsAsync.mockResolvedValueOnce({
      granted: false,
      canAskAgain: false,
      status: 'denied',
      expires: 'never',
    });
    const { result } = await renderHook(() => useVoiceRecorder());

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.start();
    });

    expect(outcome).toBe('permission-blocked');
    expect(result.current.isRecording).toBe(false);
  });

  it('chuẩn bị recorder lỗi ⇒ failed (báo được cho người dùng), không treo ở trạng thái "đang ghi"', async () => {
    audioMock.fakeRecorderControl.failPrepare = true;
    const { result } = await renderHook(() => useVoiceRecorder());

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.start();
    });

    expect(outcome).toBe('failed');
    expect(result.current.isRecording).toBe(false);
    expect(result.current.phase).toBe('idle');
  });

  it('thả tay TRƯỚC khi recorder kịp chạy ⇒ start() nhả recorder, không ghi mồ côi', async () => {
    const openGate = gatePrepare();
    const { result } = await renderHook(() => useVoiceRecorder());

    const capture: { outcome?: string; stopped?: VoiceRecordResult | null } = {};
    await act(async () => {
      const starting = result.current.start(); // kẹt ở bước chuẩn bị
      await flushMicrotasks();
      capture.stopped = await result.current.stop(); // người dùng thả tay giữa chừng
      openGate();
      capture.outcome = await starting;
    });

    expect(capture.stopped).toBeNull();
    expect(capture.outcome).toBe('aborted');
    expect(result.current.isRecording).toBe(false);
  });

  it('bấm chồng khi lượt trước còn đang khởi động ⇒ lượt sau bị bỏ qua (không chuẩn bị hai lần)', async () => {
    const openGate = gatePrepare();
    const { result } = await renderHook(() => useVoiceRecorder());

    const capture: { first?: string; second?: string } = {};
    await act(async () => {
      const first = result.current.start();
      await flushMicrotasks();
      capture.second = await result.current.start();
      openGate();
      capture.first = await first;
    });

    expect(capture.second).toBe('aborted');
    expect(capture.first).toBe('started');
    expect(result.current.isRecording).toBe(true);
  });
});
