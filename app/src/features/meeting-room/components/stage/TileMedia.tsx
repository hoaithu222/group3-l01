import { memo } from 'react';
import { View } from 'react-native';
import { Defs, RadialGradient, Rect, Stop, Svg } from 'react-native-svg';

import { useThemeColors } from '@/shared/theme';
import { Avatar, type AvatarSize } from '@/shared/ui/avatar';
import { cn } from '@/shared/utils/style/cn';

import type { RenderVideo } from './stage.types';
import { sameVideoRef } from './tile-equality.utils';

export interface TileMediaProps {
  avatarSize: AvatarSize;
  /** Người MÌNH: lật gương camera trước (như nhìn gương). */
  mirror: boolean;
  name: string;
  renderVideo: RenderVideo;
  /** Vòng "đang nói" quanh AVATAR — cha chỉ bật khi KHÔNG có video (có video thì viền của cả ô đã nói điều đó). */
  speaking: boolean;
  videoRef: unknown;
}

/** Quầng sáng TĨNH sau avatar: `primary-3` là THANG màu (giống nhau ở hai theme) nên nổi được trên nền `ink-5` ở cả sáng lẫn tối. */
function AvatarGlow() {
  const colors = useThemeColors();

  return (
    <View className="absolute inset-0" pointerEvents="none">
      <Svg height="100%" width="100%">
        <Defs>
          <RadialGradient cx="50%" cy="45%" id="meeting-tile-glow" r="50%">
            <Stop offset="0" stopColor={colors['primary-3']} stopOpacity={0.22} />
            <Stop offset="1" stopColor={colors['primary-3']} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#meeting-tile-glow)" height="100%" width="100%" x="0" y="0" />
      </Svg>
    </View>
  );
}

function TileMediaBase({
  avatarSize,
  mirror,
  name,
  renderVideo,
  speaking,
  videoRef,
}: TileMediaProps) {
  // Video CHỈ có khi adapter cấp `videoRef` (track có và chưa tắt); `null` từ `renderVideo` (lỗi/không hỗ trợ) cũng rơi về avatar.
  const video = videoRef ? renderVideo(videoRef, { mirror, objectFit: 'cover' }) : null;
  if (video) return video;

  return (
    // Avatar tự đọc tên mình — ô đã có nhãn trợ năng đầy đủ (tên + vai trò + trạng thái), để avatar lộ ra là đọc tên HAI lần.
    <View
      accessibilityElementsHidden
      className="flex-1 items-center justify-center pb-lg"
      importantForAccessibility="no-hide-descendants"
    >
      <AvatarGlow />
      {/* `collapsable={false}`: viền chỉ có màu ở MỘT trạng thái — Fabric/Android làm phẳng view rồi mất bo tròn (styling-nativewind.md). */}
      <View
        className={cn(
          'rounded-full border-thick p-2xs',
          speaking ? 'border-action-success' : 'border-transparent',
        )}
        collapsable={false}
      >
        <Avatar name={name} size={avatarSize} />
      </View>
    </View>
  );
}

const sameMedia = (a: TileMediaProps, b: TileMediaProps): boolean =>
  a.avatarSize === b.avatarSize &&
  a.mirror === b.mirror &&
  a.name === b.name &&
  a.renderVideo === b.renderVideo &&
  a.speaking === b.speaking &&
  sameVideoRef(a.videoRef, b.videoRef);

/**
 * Lớp HÌNH của ô: video (qua `renderVideo` của cha) hoặc — camera tắt — avatar lớn giữa ô trên quầng sáng tĩnh, vòng "đang nói" quanh avatar.
 *
 * ✅ `memo` RIÊNG với bộ so `sameVideoRef`: ô vẽ lại vì nhãn đổi (đang nói, giơ tay, tắt mic) thì phần tử video KHÔNG bị dựng lại — `renderVideo`
 * chỉ chạy khi track/gương/hàm vẽ thật sự đổi. Có video thì cha truyền `speaking={false}` nên nhịp "đang nói" không chạm tới lớp này.
 */
export const TileMedia = memo(TileMediaBase, sameMedia);
