import { useEffect } from 'react';
import { useVideoPlayer, VideoView } from 'expo-video';

export interface ViewerVideoProps {
  /** Trang đang được xem. Rời trang (vuốt sang tệp khác) thì TẠM DỪNG — không để tiếng phát tiếp ở trang khuất. */
  active: boolean;
  height: number;
  uri: string;
  width: number;
}

/**
 * Trang video của `MediaViewer` (`expo-video`). ⛔ KHÔNG bao giờ tự phát (không gọi `player.play()`): video có âm thanh tự bật khi
 * người dùng chỉ vuốt xem ảnh là lỗi trợ năng lẫn riêng tư. Điều khiển gốc của hệ điều hành (`nativeControls`) lo phát/dừng/tua.
 */
export function ViewerVideo({ active, height, uri, width }: ViewerVideoProps) {
  const player = useVideoPlayer({ uri });

  useEffect(() => {
    if (!active) player.pause();
  }, [active, player]);

  return (
    <VideoView contentFit="contain" nativeControls player={player} style={{ height, width }} />
  );
}
