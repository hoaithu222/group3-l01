import * as Haptics from 'expo-haptics';
import { setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ensureMicrophonePermission } from './permissions';
import { downsampleWaveform, normalizeMetering, prepareRecorder, RECORDING_OPTIONS } from './voice-recorder.utils';

export { downsampleWaveform };

/** `LIMITS.message.voiceNoteMaxSeconds` (be.md §2/§7). */
const MAX_SECONDS = 300;
/** < 1 s coi như bấm nhầm, huỷ không upload — app.md §7. */
const MIN_VALID_MS = 1000;
/** Lấy mẫu mỗi 100 ms — app.md §6. */
const SAMPLE_INTERVAL_MS = 100;

export type VoiceRecorderPhase = 'idle' | 'recording' | 'permission-blocked';

/**
 * Kết quả `start()`: `started` · `permission-blocked` (nơi gọi hiện sheet "Mở Cài đặt") · `failed` (không bật được micro — nơi gọi
 * báo lỗi) · `aborted` (người dùng THẢ TAY/huỷ trước khi recorder kịp chạy, hoặc đã có lượt khác đang chạy — đã nhả sạch, im lặng).
 */
export type VoiceStartOutcome = 'started' | 'permission-blocked' | 'failed' | 'aborted';

export interface VoiceRecordResult {
  uri: string;
  durationMs: number;
  waveform: number[];
}

/** Ghi âm voice note — `VoiceRecorderButton` là nơi dùng chính, xem `shared/ui/attachment/`. */
export function useVoiceRecorder() {
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const state = useAudioRecorderState(recorder, SAMPLE_INTERVAL_MS);
  const [phase, setPhase] = useState<VoiceRecorderPhase>('idle');
  const samplesRef = useRef<number[]>([]);
  /** `start()` đang chạy (xin quyền → chuẩn bị → ghi) — mất cả trăm ms, người dùng có thể đã thả tay giữa chừng. */
  const startingRef = useRef(false);
  /** Người dùng đã thả/huỷ TRONG lúc `start()` còn đang chạy ⇒ `start()` phải nhả recorder thay vì bắt đầu ghi. */
  const releasedRef = useRef(false);

  // `state.durationMillis` (không phải `state.metering`) làm phụ thuộc: mức âm
  // có thể GIỮ NGUYÊN giá trị giữa hai lượt đo (im lặng, hoặc mock test hằng
  // định) — dùng nó làm dependency thì effect không chạy lại và mất mẫu.
  useEffect(() => {
    if (!state.isRecording) return;
    samplesRef.current.push(normalizeMetering(state.metering));
  }, [state.durationMillis, state.isRecording, state.metering]);

  const stop = useCallback(async (): Promise<VoiceRecordResult | null> => {
    if (startingRef.current) {
      releasedRef.current = true; // `start()` tự nhả recorder khi chuẩn bị xong
      return null;
    }
    if (!recorder.isRecording) return null;
    await recorder.stop();
    setPhase('idle');

    const durationMs = state.durationMillis;
    const uri = recorder.uri ?? state.url;
    const samples = samplesRef.current;
    samplesRef.current = [];

    if (durationMs < MIN_VALID_MS || !uri) return null; // bấm nhầm — app.md §7
    return { uri, durationMs, waveform: downsampleWaveform(samples) };
  }, [recorder, state.durationMillis, state.url]);

  const cancel = useCallback(async (): Promise<void> => {
    if (startingRef.current) releasedRef.current = true;
    else if (recorder.isRecording) await recorder.stop();
    samplesRef.current = [];
    setPhase('idle');
  }, [recorder]);

  const start = useCallback(async (): Promise<VoiceStartOutcome> => {
    if (startingRef.current || recorder.isRecording) return 'aborted';
    startingRef.current = true;
    releasedRef.current = false;
    try {
      const outcome = await ensureMicrophonePermission();
      if (outcome !== 'granted') {
        setPhase('permission-blocked');
        return 'permission-blocked';
      }
      await setAudioModeAsync({ allowsRecording: true });
      await prepareRecorder(recorder);
      if (releasedRef.current) {
        await recorder.stop().catch(() => undefined); // nhả recorder vừa chuẩn bị — không ghi
        return 'aborted';
      }
      samplesRef.current = [];
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      recorder.record();
      // `record()` KHÔNG ném lỗi khi không chạy được (chưa chuẩn bị/hệ điều hành từ chối) — phải tự kiểm, kẻo UI "đang ghi" giả.
      if (!recorder.isRecording) throw new Error('Recorder không bắt đầu ghi');
      setPhase('recording');
      return 'started';
    } catch {
      await recorder.stop().catch(() => undefined);
      setPhase('idle');
      return 'failed';
    } finally {
      startingRef.current = false;
    }
  }, [recorder]);

  // Tự dừng ở `MAX_SECONDS` — "tự dừng ở 300 s" (app.md §3).
  //
  // ⚠️ `setTimeout(…, 0)` CỐ Ý, không gọi `stop()` thẳng trong thân effect:
  // `stop()` gọi `setPhase()` ĐỒNG BỘ, và `react-hooks/set-state-in-effect`
  // (React Compiler) chặn effect gây setState đồng bộ — dời sang tác vụ kế
  // tiếp là cách được chính rule đó khuyến nghị, độ trễ 0ms không đổi hành vi
  // quan sát được (người dùng không phân biệt được 0ms so với "ngay lập tức").
  useEffect(() => {
    if (!state.isRecording || state.durationMillis < MAX_SECONDS * 1000) return undefined;
    const timer = setTimeout(() => void stop(), 0);
    return () => clearTimeout(timer);
  }, [state.durationMillis, state.isRecording, stop]);

  return {
    phase,
    seconds: Math.floor(state.durationMillis / 1000),
    isRecording: state.isRecording,
    start,
    stop,
    cancel,
  };
}
