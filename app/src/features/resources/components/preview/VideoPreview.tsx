import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import type { ResourceUrlDto } from '../../api';
import { Icon } from '@/shared/ui/icon';
import { Skeleton } from '@/shared/ui/skeleton';

import { useResourceUrl } from '../../hooks/useResourceUrl';
import type { PreviewProps } from './preview.types';
import { UnsupportedPreview } from './UnsupportedPreview';

/** Số lần tự xin URL mới khi player báo lỗi — quá thì coi là lỗi thật (không phải hết hạn), tránh vòng lặp. */
const MAX_REFRESH_ATTEMPTS = 2;

interface PlayerProps {
  initialUrl: string;
  isAudio: boolean;
  name: string;
  refresh: () => Promise<ResourceUrlDto | undefined>;
}

function Player({ initialUrl, isAudio, name, refresh }: PlayerProps) {
  // Đóng băng nguồn LÚC MỞ: `useVideoPlayer` dựng lại player khi `source` đổi, mà URL ký
  // được refetch (staleTime 45 s) — không đóng băng thì phát dở bị reset mỗi lần URL mới về.
  const [source] = useState(() => ({ uri: initialUrl }));
  const player = useVideoPlayer(source, (instance) => {
    instance.timeUpdateEventInterval = 1;
  });
  const lastTime = useRef(0);
  const wasPlaying = useRef(false);
  const attempts = useRef(0);

  useEffect(() => {
    const subscriptions = [
      player.addListener('timeUpdate', ({ currentTime }) => {
        lastTime.current = currentTime;
      }),
      player.addListener('playingChange', ({ isPlaying }) => {
        wasPlaying.current = isPlaying;
      }),
      player.addListener('statusChange', ({ status }) => {
        if (status !== 'error' || attempts.current >= MAX_REFRESH_ATTEMPTS) return;
        attempts.current += 1;
        // URL ký hết hạn giữa chừng (60 s) → xin URL mới, nạp lại và TIẾP vị trí đang xem.
        void (async () => {
          try {
            const fresh = await refresh();
            if (!fresh) return;
            await player.replaceAsync({ uri: fresh.url });
            player.currentTime = lastTime.current;
            if (wasPlaying.current) player.play();
          } catch {
            // Nạp lại thất bại (mất mạng, player đã huỷ khi rời màn) — giữ nguyên trạng thái lỗi của player, không để
            // Promise reject vô chủ.
          }
        })();
      }),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [player, refresh]);

  // Không tự phát (app.md p3-01 §7): `useVideoPlayer` mặc định KHÔNG gọi `play()`.
  if (isAudio) {
    return (
      <View className="flex-1 items-center justify-center gap-md px-md">
        <Icon color="fg-2" name="audio" size={64} />
        <Text className="text-label-md text-fg-1" numberOfLines={2}>
          {name}
        </Text>
        <VideoView nativeControls player={player} style={{ height: 80, width: '100%' }} />
      </View>
    );
  }
  return (
    <View className="flex-1 bg-ink-10">
      <VideoView contentFit="contain" nativeControls player={player} style={{ flex: 1 }} />
    </View>
  );
}

/**
 * Phát video/âm thanh bằng `expo-video` từ URL ký, KHÔNG tự phát. Hết hạn giữa
 * chừng → xin URL mới, tiếp vị trí. Âm thanh dùng cùng player (chỉ hiện icon +
 * thanh điều khiển) thay vì kéo thêm `expo-audio` cho một nút phát.
 * CHƯA XÁC MINH trên thiết bị (video 50 MB + URL hết hạn giữa chừng — app.md §8).
 */
export function VideoPreview({ onDownload, onOpenExternal, resource, variant }: PreviewProps) {
  const url = useResourceUrl(resource.id, variant);

  if (url.isError) {
    return (
      <UnsupportedPreview
        actions={[
          { label: 'Mở bằng ứng dụng khác', onPress: onOpenExternal },
          { label: 'Tải về', onPress: onDownload, variant: 'secondary' },
        ]}
        reason="error"
      />
    );
  }
  if (!url.data) return <Skeleton className="h-full w-full" />;
  return (
    <Player
      initialUrl={url.data.url}
      isAudio={resource.type === 'AUDIO'}
      name={resource.name}
      refresh={url.refresh}
    />
  );
}
