import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { ShimmerSweep, Sparkles } from '@/shared/ui/effects';
import { IconTile } from '@/shared/ui/icon-tile';

import type { MyGamificationDto } from '../api/gamification.types';
import { LevelProgressBar } from './LevelProgressBar';
import { StreakSummary } from './StreakSummary';

export interface AchievementsSummaryCardProps {
  /** Màn đang hiện trước mắt (`useIsScreenFocused`) — tắt lấp lánh/ánh quét khi sang tab khác. */
  active?: boolean;
  profile: MyGamificationDto;
}

/**
 * Khối cấp (to) + XP + chuỗi ngày + lối vào lịch sử XP ở đầu màn Thành tích. Ô ngôi sao `accent` cạnh con số cấp = MỘT
 * nhận diện với hàng "Thành tích" ở màn Tôi và lối tắt ở Trang chủ (`star` · `accent`) — trang trí, nghĩa nằm ở chữ.
 *
 * ── Điểm nhấn "hero" (ngân sách vòng lặp của màn) ─────────────────────────────────────────────────────────────────
 * Khối cấp đặt trên nền TÔNG `surface-primary` (ánh quét trắng thấy được trên nền tông, gần như vô hình trên `bg-1`):
 * ✅ `Sparkles` nhỏ quanh ô ngôi sao + ✅ `ShimmerSweep` chạy MỘT lần lúc vào màn — cả hai không tính là "vòng lặp nổi
 * bật" (`MOTION_LOOP`), nên màn vẫn chừa chỗ cho đúng một vòng lặp nếu sau này cần. Số cấp đếm lên, thanh XP dâng từ trái
 * (`LevelProgressBar`). Mọi thứ tự tắt khi "Giảm chuyển động"; lớp trang trí ẩn khỏi trình đọc màn hình.
 */
export function AchievementsSummaryCard({ active = true, profile }: AchievementsSummaryCardProps) {
  return (
    <Card>
      <View className="gap-md">
        <View className="overflow-hidden rounded-sm bg-surface-primary p-md">
          <View className="flex-row items-center gap-md">
            <View
              accessibilityElementsHidden
              className="relative"
              importantForAccessibility="no-hide-descendants"
            >
              <IconTile name="star" size="lg" tone="accent" />
              <Sparkles active={active} className="-inset-3" count={4} size={10} />
            </View>
            <View className="flex-1">
              <LevelProgressBar profile={profile} size="lg" />
            </View>
          </View>
          <ShimmerSweep active={active} className="rounded-sm" delay={400} />
        </View>
        {profile.xp === 0 ? (
          <Text className="text-body-md text-fg-2">Hoàn thành việc đầu tiên để nhận XP</Text>
        ) : null}
        <StreakSummary profile={profile} />
        <Button
          label="Lịch sử điểm kinh nghiệm"
          size="sm"
          variant="tertiary"
          onPress={() => router.push('/me/xp-history')}
        />
      </View>
    </Card>
  );
}
