import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useRef, useState } from 'react';

import { uploadService } from '@/core/uploads/upload.service';
import { showToast } from '@/shared/utils/toast.utils';

export interface AssetAudio {
  /** Đang xin URL — nút hiện vòng quay, không cho bấm chồng. */
  loading: boolean;
  playing: boolean;
  toggle: () => Promise<void>;
}

/**
 * Phát âm thanh của một asset — CHỈ khi người dùng bấm (không tự phát: app.md p4-01 §6).
 *
 * ── Vì sao xin URL LÚC BẤM, không dựng sẵn bằng `useAssetUrl` ─────────────────
 * URL ký sống ≤ 60 s. Nút loa nằm trên thẻ lật/trình soạn hàng chục giây trước khi ai đó bấm; URL dựng sẵn khi mở màn đã hết
 * hạn lúc bấm ⇒ người học nghe im lặng mà không có lỗi nào. Xin lúc bấm thì URL luôn mới, và thẻ có âm thanh mà không ai
 * nghe cũng không tốn một request.
 *
 * Đang tạm dừng (chưa hết bài) thì bấm tiếp = phát tiếp trên luồng đã nạp; CHƯA phát lần nào hoặc đã hết bài thì bấm = xin URL
 * MỚI rồi phát từ đầu (URL cũ có thể đã hết hạn — không giả định trình phát còn đệm được).
 */
export function useAssetAudio(assetId: string): AssetAudio {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [loading, setLoading] = useState(false);
  const loadedRef = useRef(false);

  async function toggle(): Promise<void> {
    if (status.playing) {
      player.pause();
      return;
    }
    if (loading) return;
    const finished = status.duration > 0 && status.currentTime >= status.duration - 0.1;
    if (loadedRef.current && !finished) {
      player.play();
      return;
    }
    setLoading(true);
    try {
      const { url } = await uploadService.getAssetUrl(assetId);
      player.replace({ uri: url });
      loadedRef.current = true;
      player.play();
    } catch {
      showToast('error', 'Không phát được âm thanh. Hãy thử lại.');
    } finally {
      setLoading(false);
    }
  }

  return { loading, playing: status.playing, toggle };
}
