import { act, renderHook } from '@testing-library/react-native';

import { downsampleWaveform, useVoiceRecorder, type VoiceRecordResult } from '../use-voice-recorder';

/**
 * `expo-audio` được mock TOÀN CỤC (`jest.setup.js` → `__mocks__/expo-audio.ts`)
 * bằng một `FakeAudioRecorder` tự poll `getStatus()` bằng `setInterval` giống
 * bản thật — nên `jest.useFakeTimers()` + `jest.advanceTimersByTime()` mô
 * phỏng đúng thời gian ghi âm "trôi qua" mà không phải chờ thật.
 *
 * Các ca vòng đời `start()` (chuẩn bị recorder, thiếu quyền, thả tay giữa chừng…) ở `use-voice-recorder.start.test.ts`.
 */
describe('downsampleWaveform', () => {
  it('luôn trả đúng 64 điểm, kể cả khi mẫu thô ít hơn 64', () => {
    expect(downsampleWaveform([50])).toHaveLength(64);
    expect(downsampleWaveform([])).toHaveLength(64);
    expect(downsampleWaveform(Array.from({ length: 200 }, (_, i) => i))).toHaveLength(64);
  });

  it('mọi điểm nằm trong khoảng 0..100', () => {
    downsampleWaveform(Array.from({ length: 40 }, () => 37)).forEach((point) => {
      expect(point).toBeGreaterThanOrEqual(0);
      expect(point).toBeLessThanOrEqual(100);
    });
  });
});

describe('useVoiceRecorder', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('ghi dưới 1 giây coi như bấm nhầm — stop() trả null, không upload', async () => {
    const { result } = await renderHook(() => useVoiceRecorder());

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      jest.advanceTimersByTime(200); // < MIN_VALID_MS (1000ms) — app.md §7
    });

    const capture: { stopped: VoiceRecordResult | null } = { stopped: null };
    await act(async () => {
      capture.stopped = await result.current.stop();
    });

    expect(capture.stopped).toBeNull();
  });

  it('ghi đủ lâu → stop() trả uri + waveform ĐÚNG 64 điểm', async () => {
    const { result } = await renderHook(() => useVoiceRecorder());

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      jest.advanceTimersByTime(2000); // 2s, đủ điều kiện hợp lệ
    });

    const capture: { stopped: VoiceRecordResult | null } = { stopped: null };
    await act(async () => {
      capture.stopped = await result.current.stop();
    });

    const { stopped } = capture;
    if (!stopped) throw new Error('stop() phải trả kết quả khi ghi đủ lâu (≥ MIN_VALID_MS)');
    expect(stopped.uri).toBeTruthy();
    expect(stopped.durationMs).toBeGreaterThanOrEqual(1000);
    expect(stopped.waveform).toHaveLength(64);
  });

  it('tự dừng ở 300 giây (MAX_SECONDS) — không cần người dùng thả tay', async () => {
    const { result } = await renderHook(() => useVoiceRecorder());

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.isRecording).toBe(true);

    // Đủ tick 100ms để `durationMillis` vượt `MAX_SECONDS` — effect tự dừng
    // dùng `setTimeout(…, 0)` (tránh setState đồng bộ trong effect, xem
    // `use-voice-recorder.ts`), nên cần MỘT lượt advance nữa để macrotask đó
    // chạy, rồi thêm một tick poll 100ms để `state.isRecording` phản ánh
    // `false` (mock chỉ cập nhật state theo `setInterval`, không tức thời).
    await act(async () => {
      jest.advanceTimersByTime(301_000);
    });
    await act(async () => {
      jest.advanceTimersByTime(0);
      await Promise.resolve();
    });
    await act(async () => {
      jest.advanceTimersByTime(100);
    });

    expect(result.current.isRecording).toBe(false);
  });
});
