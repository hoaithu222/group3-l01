/**
 * Mock `expo-audio` cho Jest.
 *
 * Module thật dựng `AudioRecorder` như một `SharedObject` native — không có
 * bản chạy được trong Node. Bản mock này giả lập đủ để `use-voice-recorder.ts`
 * chạy THẬT (không bỏ qua logic): `record()`/`stop()` đổi trạng thái, và
 * `useAudioRecorderState` TỰ POLL bằng `setInterval` giống bản thật — nhờ vậy
 * test dùng `jest.useFakeTimers()` + `act(() => jest.advanceTimersByTime(...))`
 * để mô phỏng thời gian trôi qua.
 *
 * `Date.now()` cũng bị dời theo bởi fake timer "modern" của Jest, nên
 * `durationMillis` tính từ `Date.now() - startedAt` phản ánh đúng thời gian đã
 * "trôi" trong test.
 */
import { useEffect, useState } from 'react';

export const RecordingPresets = {
  HIGH_QUALITY: {
    extension: '.m4a',
    sampleRate: 44100,
    numberOfChannels: 2,
    bitRate: 128000,
    android: {},
    ios: {},
    web: {},
  },
};

export const setAudioModeAsync = jest.fn(async () => undefined);

export const requestRecordingPermissionsAsync = jest.fn(async () => ({
  granted: true,
  canAskAgain: true,
  status: 'granted',
  expires: 'never',
}));

/**
 * Núm điều khiển cho test (đặt lại trong `beforeEach`): `failPrepare` — `prepareToRecordAsync()` ném lỗi;
 * `prepareGate` — `prepareToRecordAsync()` chờ promise này (mô phỏng chuẩn bị chậm để thử "thả tay trước khi kịp ghi").
 */
export const fakeRecorderControl: { failPrepare: boolean; prepareGate: Promise<void> | null } = {
  failPrepare: false,
  prepareGate: null,
};

/**
 * ⚠️ Mô phỏng ĐÚNG hành vi native của `expo-audio` (Android `AudioModule.kt`/`AudioRecorder.kt`), không "tiện tay" hơn:
 * `record()` chỉ chạy khi ĐÃ `prepareToRecordAsync()` (chưa chuẩn bị = lệnh RỖNG, không ném lỗi); chuẩn bị khi đã chuẩn bị/đang ghi
 * thì ném lỗi; `stop()` reset về chưa chuẩn bị (lượt sau phải chuẩn bị lại). Bản cũ cho `record()` chạy vô điều kiện nên
 * `use-voice-recorder.ts` thiếu bước chuẩn bị mà test vẫn xanh — mic hỏng trên máy thật.
 */
class FakeAudioRecorder {
  isRecording = false;
  isPrepared = false;
  uri: string | null = null;
  currentTime = 0;
  private startedAt = 0;
  private lastDuration = 0;

  record(): void {
    if (!this.isPrepared) return;
    this.isRecording = true;
    this.uri = 'file:///fake-recording.m4a';
    this.startedAt = Date.now();
  }

  async stop(): Promise<void> {
    if (this.isRecording) this.lastDuration = Date.now() - this.startedAt;
    this.isRecording = false;
    this.isPrepared = false;
  }

  pause(): void {
    this.isRecording = false;
  }

  async prepareToRecordAsync(): Promise<void> {
    if (this.isPrepared || this.isRecording) throw new Error('AudioRecorderAlreadyPreparedException');
    if (fakeRecorderControl.prepareGate) await fakeRecorderControl.prepareGate;
    if (fakeRecorderControl.failPrepare) throw new Error('AudioRecorderPrepareException');
    this.isPrepared = true;
  }

  getStatus() {
    const durationMillis = this.isRecording ? Date.now() - this.startedAt : this.lastDuration;
    return {
      canRecord: true,
      isRecording: this.isRecording,
      durationMillis,
      mediaServicesDidReset: false,
      // Hằng số CÓ CHỦ Ý — test độ dài/khoảng giá trị của waveform không cần
      // mức âm biến thiên thật, chỉ cần đủ mẫu để downsample về 64 điểm.
      metering: this.isRecording ? -20 : undefined,
      url: this.uri,
    };
  }
}

export function useAudioRecorder(): FakeAudioRecorder {
  // `useState` với hàm khởi tạo LƯỜI (không phải `useRef` + gán trong lúc
  // render) — `eslint-plugin-react-hooks` (React Compiler) chặn đọc/ghi
  // `ref.current` TRONG lúc render, kể cả để khởi tạo một lần.
  const [recorder] = useState(() => new FakeAudioRecorder());
  return recorder;
}

export function useAudioRecorderState(recorder: FakeAudioRecorder, interval = 500) {
  const [, forceRender] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceRender((n) => n + 1), interval);
    return () => clearInterval(id);
  }, [recorder, interval]);
  return recorder.getStatus();
}
