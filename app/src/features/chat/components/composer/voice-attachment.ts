import * as FileSystem from 'expo-file-system/legacy';

import type { PickedFile } from '@/core/uploads/upload.types';
import type { VoiceRecordResult } from '@/core/media/use-voice-recorder';

/**
 * `useVoiceRecorder` (core/media) không trả `size` (không phải việc của nó —
 * `expo-audio` không đo dung lượng file). `upload.pipeline.ts` thì LẤY THẲNG
 * `item.size` để tạo asset (không tự đo lại), nên phải đo ở đây trước khi đưa
 * vào hàng đợi — thiếu bước này thì `POST /assets` nhận `size: 0` và BE từ
 * chối (`ASSET_007` "Chưa nhận được nội dung tệp").
 */
export async function voiceResultToPickedFile(result: VoiceRecordResult): Promise<PickedFile> {
  const info = await FileSystem.getInfoAsync(result.uri);
  const size = info.exists ? info.size : 0;
  return {
    uri: result.uri,
    name: `voice-note-${Date.now()}.m4a`,
    // M4A là container MPEG-4 ⇒ MIME chuẩn là `audio/mp4`. `audio/m4a` KHÔNG nằm trong allowlist VOICE của BE
    // (`audio/mp4|aac|mpeg|ogg`) nên bị từ chối `400 VAL_001` ngay ở `POST /assets`.
    mime: 'audio/mp4',
    size,
    kind: 'VOICE',
    durationMs: result.durationMs,
    waveform: result.waveform,
  };
}
