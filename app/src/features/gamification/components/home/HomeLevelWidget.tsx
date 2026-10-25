import { router } from 'expo-router';
import { View } from 'react-native';

import { LinkButton } from '@/shared/ui/button';
import { Section } from '@/shared/ui/section';

import { useHomeGamificationProfile } from '../../hooks/useHomeGamification';
import { pickAchievementStats } from '../../utils/achievement-stats';
import { levelCaption, levelLabel, levelPercent } from '../../utils/level-math';
import { XpTrack } from '../XpTrack';
import { HomeAchievementGrid } from './HomeAchievementGrid';
import { HomeStatCard } from './HomeStatCard';
import { HomeWidgetSkeleton } from './HomeWidgetSkeleton';

const TITLE = 'Cấp độ và thành tích';

/**
 * Thẻ cấp độ (khuôn `HomeStatCard`: số cấp đếm lên + thanh XP mảnh dâng từ trái, phần trăm do server tính) và lưới
 * "Thành tích" 2×2 các bộ đếm khác 0. Lối "Chi tiết" mở màn Thành tích đầy đủ. Ẩn khi cờ tắt/lỗi; tải lần đầu ⇒ khung
 * xương; mọi bộ đếm bằng 0 ⇒ chỉ còn thẻ cấp độ (lưới tự biến mất, không có ô "0" giả). Người mới (0 XP) được gợi ý việc
 * đầu tiên bằng chữ — ở đúng chỗ chú thích, thay cho "còn N XP".
 *
 * ⚠️ Thẻ KHÔNG bấm cả khối: thanh XP là một `progressbar` có giá trị riêng — lồng trong nút là trình đọc màn hình mất nó.
 */
export function HomeLevelWidget() {
  const { enabled, me } = useHomeGamificationProfile();

  if (!enabled) return null;
  if (me.isLoading) return <HomeWidgetSkeleton title={TITLE} />;
  if (!me.data) return null;

  const profile = me.data;
  const caption = profile.xp === 0 ? 'Hoàn thành việc đầu tiên để nhận XP' : levelCaption(profile);

  return (
    <Section
      action={
        <LinkButton
          accessibilityLabel="Mở màn Thành tích"
          label="Chi tiết"
          onPress={() => router.push('/me/achievements')}
        />
      }
      title={TITLE}
    >
      <View className="gap-sm">
        <HomeStatCard
          accessibilityLabel={`Cấp ${profile.level}. ${caption}`}
          caption={caption}
          format={levelLabel}
          icon="star"
          label="Cấp độ hiện tại"
          tone="accent"
          value={profile.level}
        >
          <XpTrack
            accessibilityLabel={`Cấp ${profile.level}, ${levelCaption(profile).toLowerCase()}`}
            percent={Math.round(levelPercent(profile))}
            size="sm"
          />
        </HomeStatCard>
        <HomeAchievementGrid stats={pickAchievementStats(profile.counters)} />
      </View>
    </Section>
  );
}
