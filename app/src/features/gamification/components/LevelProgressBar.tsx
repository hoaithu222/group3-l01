import { Text, View } from 'react-native';

import { AnimatedNumber } from '@/shared/ui/motion';

import type { MyGamificationDto } from '../api/gamification.types';
import { formatXp, levelCaption, levelLabel, levelPercent } from '../utils/level-math';
import { XpTrack } from './XpTrack';

export interface LevelProgressBarProps {
  profile: Pick<MyGamificationDto, 'level' | 'xp' | 'xpIntoLevel' | 'xpToNext'>;
  /** `lg`: khối cấp to ở màn Thành tích; `sm`: gọn trong thẻ hồ sơ màn Tôi. */
  size?: 'lg' | 'sm';
}

/**
 * "Cấp 12 · còn 450 XP để lên cấp 13" + thanh tiến độ (app.md p4-03 §2). Phần trăm lấy từ `xpIntoLevel`/`xpToNext`
 * của server — không tự tính ngưỡng. Luôn có CHỮ, không chỉ màu thanh.
 *
 * ✅ Số cấp ĐẾM LÊN lúc vào màn (`AnimatedNumber`) và thanh DÂNG từ trái (`XpTrack`) — cùng một nhịp `slow`, tự tắt khi
 * "Giảm chuyển động". Trình đọc màn hình nghe số cuối, không nghe các số trung gian.
 */
export function LevelProgressBar({ profile, size = 'sm' }: LevelProgressBarProps) {
  const percent = Math.round(levelPercent(profile));
  const caption = levelCaption(profile);

  return (
    <View className="gap-xs self-stretch">
      <View className="flex-row items-baseline justify-between gap-sm">
        <AnimatedNumber
          className={
            size === 'lg'
              ? 'text-header-md font-bold text-fg-1'
              : 'text-body-lg font-semibold text-fg-1'
          }
          format={levelLabel}
          value={profile.level}
        />
        <Text className="text-body-md text-fg-2">Tổng {formatXp(profile.xp)}</Text>
      </View>
      <XpTrack
        accessibilityLabel={`Cấp ${profile.level}, ${caption.toLowerCase()}`}
        percent={percent}
      />
      <Text className="text-caption-lg text-fg-2">{caption}</Text>
    </View>
  );
}
