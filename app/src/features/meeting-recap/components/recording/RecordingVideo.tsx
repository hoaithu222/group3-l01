import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

export interface RecordingVideoProps {
  /** URL ký `STREAM` đầu tiên (900 s). */
  initialUrl: string;
  /** Xin URL mới khi player lỗi (403 hết hạn giữa chừng) — `null` = bỏ cuộc (màn chuyển sang trạng thái lỗi). */
  renew: () => Promise<string | null>;
}

/**
 * Trình phát bản ghi bằng `expo-video` (app.md §3 `RecordingPlayerScreen`): điều khiển native (tua, toàn màn hình của hệ điều hành), KHÔNG
 * tự phát. Nguồn ĐÓNG BĂNG lúc mở (`useVideoPlayer` dựng lại player khi `source` đổi — phát dở sẽ bị reset); URL hết hạn giữa chừng →
 * `replaceAsync` URL mới rồi TIẾP đúng vị trí + trạng thái phát (RR-15: "không gián đoạn dài").
 *
 * ⚠️ PiP/xoay ngang tự do chưa bật: cần plugin `expo-video` (`supportsPictureInPicture`) + `expo-screen-orientation` trong `app.config.ts`
 * (ngoài vùng p2-06). CHƯA KIỂM CHỨNG trên thiết bị (video 60 phút, 4G, URL hết hạn giữa chừng).
 */
export function RecordingVideo({ initialUrl, renew }: RecordingVideoProps) {
  const [source] = useState(() => ({ uri: initialUrl }));
  const player = useVideoPlayer(source, (instance) => {
    instance.timeUpdateEventInterval = 1;
  });
  const lastTime = useRef(0);
  const wasPlaying = useRef(false);
  const renewing = useRef(false);

  useEffect(() => {
    const subscriptions = [
      player.addListener('timeUpdate', ({ currentTime }) => {
        lastTime.current = currentTime;
      }),
      player.addListener('playingChange', ({ isPlaying }) => {
        wasPlaying.current = isPlaying;
      }),
      player.addListener('statusChange', ({ status }) => {
        if (status !== 'error' || renewing.current) return;
        renewing.current = true;
        void (async () => {
          const url = await renew();
          if (url) {
            await player.replaceAsync({ uri: url });
            player.currentTime = lastTime.current;
            if (wasPlaying.current) player.play();
          }
          renewing.current = false;
        })();
      }),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [player, renew]);

  return (
    <View accessibilityLabel="Trình phát bản ghi cuộc họp" className="flex-1 bg-ink-10">
      <VideoView contentFit="contain" nativeControls player={player} style={{ flex: 1 }} />
    </View>
  );
}
