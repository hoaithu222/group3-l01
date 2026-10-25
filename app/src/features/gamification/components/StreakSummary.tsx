import { Text, View } from 'react-native';

import { Icon, type IconName } from '@/shared/ui/icon';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';
import { AnimatedNumber } from '@/shared/ui/motion';

import type { MyGamificationDto } from '../api/gamification.types';

export interface StreakSummaryProps {
  profile: Pick<MyGamificationDto, 'longestStreak' | 'streak' | 'streakAtRisk'>;
}

const daysText = (value: number) => `${Math.round(value)} ngày`;

/** Một ô số nhỏ: `IconTile sm` + nhãn + số ngày đếm lên. Cả ô là MỘT ô trợ năng ("Chuỗi hiện tại: 4 ngày"). */
function StreakStat({
  icon,
  label,
  tone,
  value,
}: {
  icon: IconName;
  label: string;
  tone: IconTileTone;
  value: number;
}) {
  return (
    <View
      accessibilityLabel={`${label}: ${daysText(value)}`}
      accessible
      className="flex-1 flex-row items-center gap-xs rounded-sm bg-bg-2 p-sm"
    >
      <IconTile name={icon} size="sm" tone={tone} />
      <View className="flex-1">
        <Text className="text-caption-lg text-fg-2">{label}</Text>
        <AnimatedNumber
          className="text-label-lg font-semibold text-fg-1"
          format={daysText}
          value={value}
        />
      </View>
    </View>
  );
}

/**
 * Chuỗi ngày hiện tại + dài nhất — hai ô số cạnh nhau (thay cho một dòng chữ dài) để mắt so được ngay. `streakAtRisk`
 * (server tính: hôm nay chưa hoạt động) → gợi ý nhẹ "Sắp mất chuỗi" bằng CHỮ, không push (app.md §7).
 */
export function StreakSummary({ profile }: StreakSummaryProps) {
  return (
    <View className="gap-xs">
      <View className="flex-row gap-sm">
        <StreakStat
          icon="flash"
          label="Chuỗi hiện tại"
          tone={profile.streak > 0 ? 'warning' : 'brand'}
          value={profile.streak}
        />
        <StreakStat
          icon="calendar-favorite"
          label="Dài nhất"
          tone="accent"
          value={profile.longestStreak}
        />
      </View>
      {profile.streakAtRisk && profile.streak > 0 ? (
        // `warning` chỉ 4.06:1 trên thẻ trắng — dưới 4.5 của chữ nhỏ. Màu cảnh báo ở BIỂU TƯỢNG (hình cần 3:1), chữ dùng
        // `fg-2`; biểu tượng + chữ nên MÀU không phải dấu hiệu duy nhất (`src/shared/ui/AGENTS.md`).
        <View className="flex-row items-center gap-xs">
          <Icon color="warning" name="alert-warning" size="sm" />
          <Text className="flex-1 text-caption-lg text-fg-2">
            Sắp mất chuỗi — hoạt động hôm nay để giữ chuỗi
          </Text>
        </View>
      ) : null}
    </View>
  );
}
