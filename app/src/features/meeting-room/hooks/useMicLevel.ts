import { RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState, type AudioRecorder } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useRef } from 'react';

/** Preset nhẹ nhất + đo mức âm — chỉ để lấy `metering`, KHÔNG giữ bản ghi (xoá ngay khi dừng). */
const METER_OPTIONS = { ...RecordingPresets.LOW_QUALITY, isMeteringEnabled: true };
const SAMPLE_INTERVAL_MS = 100;

/** dBFS (thường -60..0 với micro thoại) → 0..100 — cùng thang với `useVoiceRecorder`. */
const normalize = (db: number | undefined): number => Math.round(((Math.max(-60, Math.min(0, db ?? -60)) + 60) / 60) * 100);

/** Dừng đo và XOÁ tệp tạm: bản ghi âm thử ở pre-join không được nằm lại trong bộ nhớ đệm (riêng tư). */
async function stopAndDiscard(recorder: AudioRecorder): Promise<void> {
  try {
    if (recorder.isRecording) await recorder.stop();
    if (recorder.uri) await FileSystem.deleteAsync(recorder.uri, { idempotent: true });
  } catch {
    /* không dọn được tệp tạm thì thôi — hệ điều hành dọn bộ nhớ đệm */
  }
}

/**
 * Mức mic (0..100) cho `MicLevelMeter` ở pre-join khi người dùng BẬT mic thử. Mượn `expo-audio` (recorder có đo mức) vì cổng media chưa
 * kết nối phòng ở bước này. Tắt (`enabled = false`), rời pre-join hay đang nối phòng → dừng ngay, nhường phiên âm thanh cho LiveKit.
 *
 * ✅ Bật/tắt nối tiếp nhau qua MỘT hàng đợi (`queue`): bật→tắt→bật nhanh từng làm `prepareToRecordAsync` lần hai chạy khi lần dừng trước chưa
 * xong ⇒ lỗi bị nuốt, thanh mức đứng ở 0 dù mic đang bật; và lượt bị huỷ giữa lúc chuẩn bị để lại recorder đã chuẩn bị + tệp tạm.
 *
 * ⚠️ CHƯA XÁC MINH trên thiết bị thật: tương tác giữa recorder thử và `AudioSession` của LiveKit lúc chuyển sang kết nối (iOS/Android).
 */
export function useMicLevel(enabled: boolean): number {
  const recorder = useAudioRecorder(METER_OPTIONS);
  const state = useAudioRecorderState(recorder, SAMPLE_INTERVAL_MS);
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    queue.current = queue.current.then(async () => {
      if (cancelled) return;
      try {
        await setAudioModeAsync({ allowsRecording: true });
        await recorder.prepareToRecordAsync();
        // Bị tắt giữa lúc chuẩn bị: KHÔNG ghi — lượt dọn của cleanup (xếp ngay sau trong hàng) xoá tệp tạm vừa chuẩn bị.
        if (!cancelled) recorder.record();
      } catch {
        /* không mở được mic để đo — thanh mức đứng yên ở 0, người dùng vẫn vào họp bình thường */
      }
    });
    return () => {
      cancelled = true;
      queue.current = queue.current.then(() => stopAndDiscard(recorder));
    };
  }, [enabled, recorder]);

  return enabled && state.isRecording ? normalize(state.metering) : 0;
}
