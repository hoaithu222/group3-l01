import { Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Sparkles } from '@/shared/ui/effects';
import { PressableScale, Reveal } from '@/shared/ui/motion';
import { cn } from '@/shared/utils/style/cn';

import type { LeaderboardEntry } from '../api/gamification.types';
import { useAvatarSource } from '../hooks/useAvatarSource';
import { formatXp } from '../utils/level-math';

/** Huy chương chỉ để trang trí — HẠNG luôn có chữ ("Hạng 1"), không dựa vào emoji/màu (app.md p4-03 §3). */
const MEDALS = ['🥇', '🥈', '🥉'] as const;
/**
 * Nền ô theo hạng: vàng · bạc · đồng (`surface-secondary` · `surface-neutral` · `surface-warning`) — cùng họ màu với huy
 * chương nên ba ô không còn giống hệt nhau. Chữ `fg-2` trên cả ba nền đạt ≥ 4.8:1 (sáng) / ≥ 6.2:1 (tối); hạng vẫn là CHỮ.
 */
const PODIUM_TILE = ['bg-surface-secondary', 'bg-surface-neutral', 'bg-surface-warning'] as const;

export interface LeaderboardPodiumProps {
  /** Màn đang hiện trước mắt (`useIsScreenFocused`) — tắt lấp lánh quanh hạng 1 khi sang tab khác. */
  active?: boolean;
  /** Tối đa 3 người đầu bảng, theo hạng. */
  entries: LeaderboardEntry[];
  onPress: (entry: LeaderboardEntry) => void;
}

/**
 * Một ô của bục: huy chương · avatar · "Hạng n" · tên · XP. Component riêng vì mỗi ô gọi `useAvatarSource` (hook không gọi
 * được trong `.map()`). `PressableScale`: thẻ độc lập có bo góc ⇒ co nhẹ khi nhấn (thay `active:opacity-80` khó thấy dưới
 * ngón tay); nền/bo góc ở `contentClassName` (lớp co), bố cục ở `className`.
 */
function PodiumCard({
  active,
  entry,
  index,
  onPress,
}: {
  active: boolean;
  entry: LeaderboardEntry;
  index: number;
  onPress: (entry: LeaderboardEntry) => void;
}) {
  const avatar = useAvatarSource(entry.avatarAssetId);

  return (
    <PressableScale
      accessibilityHint="Chạm hai lần để xem hồ sơ thành tích"
      accessibilityLabel={`Hạng ${entry.rank}, ${entry.name}, cấp ${entry.level}, ${formatXp(entry.xp)}`}
      accessibilityRole="button"
      className="flex-1"
      contentClassName={cn(
        'min-h-24 items-center justify-center gap-2xs rounded-md p-sm',
        PODIUM_TILE[index] ?? 'bg-surface-primary',
      )}
      fill
      onPress={() => onPress(entry)}
    >
      <Text accessibilityElementsHidden className="text-header-sm" importantForAccessibility="no">
        {MEDALS[index]}
      </Text>
      <View className="relative">
        <Avatar name={entry.name} size="md" source={avatar} />
        {/* ✅ Chỉ hạng 1 lấp lánh — điểm nhấn nhỏ, không tính vào ngân sách vòng lặp; trang trí, ẩn khỏi trình đọc. */}
        {index === 0 ? <Sparkles active={active} className="-inset-3" count={3} size={10} /> : null}
      </View>
      <Text className="text-label-md text-fg-2">{`Hạng ${entry.rank}`}</Text>
      <Text className="text-center text-body-md font-semibold text-fg-1" numberOfLines={1}>
        {entry.name}
      </Text>
      <Text className="text-caption-lg tabular-nums text-fg-2">{formatXp(entry.xp)}</Text>
    </PressableScale>
  );
}

/**
 * Top 3 nổi bật ở đầu bảng: ba ô ngang hàng, mỗi ô huy chương + avatar + "Hạng n" + tên + XP. Ô hiện dần kiểu PHÓNG
 * (`Reveal kind="zoom"`) lệch nhịp theo hạng — một lần lúc dữ liệu về, tự tắt khi "Giảm chuyển động". Bục nằm ở
 * `ListHeaderComponent` (không bị tái dùng khi cuộn như hàng) nên `Reveal` an toàn ở đây.
 */
export function LeaderboardPodium({ active = true, entries, onPress }: LeaderboardPodiumProps) {
  if (entries.length === 0) return null;
  return (
    <View className="flex-row gap-sm px-md py-sm">
      {entries.slice(0, 3).map((entry, index) => (
        <Reveal key={entry.userId} className="flex-1" index={index} kind="zoom">
          <PodiumCard active={active} entry={entry} index={index} onPress={onPress} />
        </Reveal>
      ))}
    </View>
  );
}
