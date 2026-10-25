import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { IconTile } from '@/shared/ui/icon-tile';

import { STUDY_MODE_META } from '../../constants/study-modes.constants';
import { StudyProgressBar } from './StudyProgressBar';
import type { CardMode } from './study-tone.constants';

export interface StudyProgressHeaderProps {
  /** "3/20" — vị trí thẻ đang xem. Đọc lên là "Tiến độ 3/20". */
  counter: string;
  mode: CardMode;
  /** 0..100 — thanh tiến độ. */
  percent: number;
  /** Dòng nhỏ dưới bộ đếm; mặc định là tên chế độ ("Học thẻ"). Ôn theo lịch truyền tên bộ của thẻ. */
  subtitle?: string;
  /** Khe bên phải (Học thẻ: chip "Xáo trộn"). */
  trailing?: ReactNode;
}

/**
 * Đầu phiên thẻ: ô icon của chế độ (`STUDY_MODE_META` — cùng màu/icon với Trang chủ và tổng quan bộ) + bộ đếm "n/tổng" + thanh
 * tiến độ tông chế độ. Dùng chung Học thẻ và Ôn theo lịch để hai chế độ trông cùng một bộ nhưng nhận ra bằng màu.
 *
 * ⚠️ `flex-1` ở khối chữ: `<Text>` mặc định không co — thiếu nó, khe `trailing` bị đẩy ra ngoài mép khi cỡ chữ hệ thống lớn.
 * Màu KHÔNG phải kênh duy nhất: tên chế độ luôn có bằng chữ.
 */
export function StudyProgressHeader({
  counter,
  mode,
  percent,
  subtitle,
  trailing,
}: StudyProgressHeaderProps) {
  const meta = STUDY_MODE_META[mode];
  return (
    <View className="gap-xs">
      <View className="flex-row items-center gap-sm">
        <IconTile name={meta.icon} size="sm" tone={meta.tone} />
        <View className="flex-1">
          <Text accessibilityLabel={`Tiến độ ${counter}`} className="text-label-lg text-fg-1">
            {counter}
          </Text>
          <Text className="text-caption-sm text-fg-2" numberOfLines={1}>
            {subtitle ?? meta.label}
          </Text>
        </View>
        {trailing}
      </View>
      <StudyProgressBar percent={percent} tone={meta.tone} />
    </View>
  );
}
