import { Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';

import type { MyGamificationDto } from '../api/gamification.types';

/** Sau giờ này (giờ địa phương) mà hôm nay chưa hoạt động thì nhắc "Sắp mất chuỗi" (app.md p4-03 §2). */
const AT_RISK_HINT_HOUR = 20;

export interface StreakFlameProps {
  /** Giờ hiện tại (0–23) — chỉ để test; mặc định đọc đồng hồ máy. */
  hour?: number;
  profile: Pick<MyGamificationDto, 'streak' | 'streakAtRisk'>;
}

/**
 * Chuỗi ngày gọn — icon + "Chuỗi 5 ngày" — để đặt cạnh tên trong thẻ hồ sơ màn Tôi (export qua `index.ts`). Gợi ý "Sắp
 * mất chuỗi" bằng CHỮ, chỉ khi server báo `streakAtRisk` VÀ đã sau 20:00; không push riêng (tránh ép dùng app).
 */
export function StreakFlame({ hour, profile }: StreakFlameProps) {
  const now = hour ?? new Date().getHours();
  const atRisk = profile.streakAtRisk && profile.streak > 0 && now >= AT_RISK_HINT_HOUR;
  const label = `Chuỗi ${profile.streak} ngày`;

  return (
    <View
      accessibilityLabel={atRisk ? `${label}, sắp mất chuỗi` : label}
      accessible
      className="flex-row items-center gap-2xs"
    >
      <Icon color={atRisk ? 'warning' : 'fg-brand'} name="flash" size="sm" />
      <Text className="text-label-md text-fg-1">{label}</Text>
      {/* `warning` chỉ 4.06:1 trên thẻ trắng (bản vẽ chỉ định, không đổi được) — dưới 4.5 của chữ nhỏ. Cách bù đúng luật
          (`src/shared/ui/AGENTS.md`): màu cảnh báo ở BIỂU TƯỢNG (ngọn lửa đổi sang `warning`, hình cần 3:1), còn CHỮ dùng `fg-2`. */}
      {atRisk ? <Text className="text-caption-lg text-fg-2">· Sắp mất chuỗi</Text> : null}
    </View>
  );
}
