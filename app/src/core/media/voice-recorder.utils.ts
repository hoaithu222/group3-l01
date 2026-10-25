import { RecordingPresets, type AudioRecorder } from 'expo-audio';

/** Khớp `waveform` BE — mảng 64 điểm 0..100 (`completeAssetSchema`). */
const WAVEFORM_POINTS = 64;

/** Preset ghi âm app.md §6: `.m4a`, AAC, 44.1 kHz, mono, 64 kbps, có đo mức âm. */
export const RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  extension: '.m4a',
  sampleRate: 44100,
  numberOfChannels: 1,
  bitRate: 64000,
  isMeteringEnabled: true,
};

/** dBFS (thường -60..0 với micro thoại) → 0..100 — thang `waveform` của BE. */
export function normalizeMetering(db: number | undefined): number {
  const clamped = Math.max(-60, Math.min(0, db ?? -60));
  return Math.round(((clamped + 60) / 60) * 100);
}

/** Trải đều mẫu thô về ĐÚNG 64 điểm — mẫu ít hơn 64 (ghi rất ngắn) vẫn phải đủ mảng cho BE. */
export function downsampleWaveform(samples: number[]): number[] {
  if (samples.length === 0) return new Array<number>(WAVEFORM_POINTS).fill(0);
  return Array.from({ length: WAVEFORM_POINTS }, (_, i) => {
    const index = Math.min(samples.length - 1, Math.floor((i / WAVEFORM_POINTS) * samples.length));
    return samples[index] ?? 0;
  });
}

/**
 * Chuẩn bị recorder cho MỘT lượt ghi.
 *
 * ⛔ `expo-audio` BẮT BUỘC `prepareToRecordAsync()` trước MỖI `record()`: native Android chỉ chạy `record()` khi `isPrepared`
 * (`AudioModule.kt`: `if (recorder.isPrepared) { … }`) — chưa chuẩn bị thì `record()` là lệnh RỖNG, không ném lỗi, không ghi gì,
 * mà UI vẫn hiện "đang ghi" (đã cấp quyền micro vẫn không ra tin thoại). Sau `stop()` recorder bị `reset()` (`isPrepared = false`)
 * nên lượt sau cũng phải chuẩn bị lại — không dùng lại trạng thái của lượt trước.
 */
export async function prepareRecorder(recorder: AudioRecorder): Promise<void> {
  try {
    await recorder.prepareToRecordAsync();
  } catch {
    // Còn sót một lượt đã chuẩn bị/ghi dở (vd lượt trước bị huỷ giữa chừng) ⇒ native ném `AudioRecorderAlreadyPreparedException`:
    // nhả nó rồi chuẩn bị lại MỘT lần; vẫn lỗi thì để lỗi thật nổi lên cho `start()` báo `failed`.
    await recorder.stop().catch(() => undefined);
    await recorder.prepareToRecordAsync();
  }
}
