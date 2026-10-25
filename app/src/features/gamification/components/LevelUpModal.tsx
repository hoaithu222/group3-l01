import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { AccessibilityInfo, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { Dialog } from '@/shared/ui/modal';

import { formatXp } from '../utils/level-math';
import { levelUpAnnouncement, type LevelUpItem } from '../utils/gamification-events';
import { LevelUpConfetti } from './LevelUpConfetti';

export interface LevelUpModalProps {
  /** `null` ⇒ ẩn. */
  item: LevelUpItem | null;
  /** XP còn thiếu tới cấp kế (từ `me` đã tải lại) — thiếu thì bỏ dòng này; `0` = đã ở cấp tối đa. */
  xpToNext?: number;
  onDismiss: () => void;
}

/**
 * "Lên cấp 13!" (app.md p4-03 §3, §7). KHÔNG tự đóng và KHÔNG đóng khi chạm nền — chỉ nút "Tuyệt" (hoặc nút Back của
 * Android) đóng và gửi `seen { level }`. Trình đọc màn hình đọc "Chúc mừng, bạn đã lên cấp 13" ngay khi hiện.
 * ⚠️ "Giảm chuyển động" bật ⇒ không pháo giấy, không rung (`LevelUpConfetti` tự kiểm; rung kiểm ở đây).
 */
export function LevelUpModal({ item, onDismiss, xpToNext }: LevelUpModalProps) {
  const reduceMotion = useReducedMotion();
  const level = item?.to;

  useEffect(() => {
    if (level === undefined) return;
    AccessibilityInfo.announceForAccessibility(levelUpAnnouncement(level));
    if (!reduceMotion) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [level, reduceMotion]);

  return (
    <Dialog
      actionsDirection="column"
      description={item ? levelUpAnnouncement(item.to) : undefined}
      dismissOnBackdrop={false}
      primaryAction={{ label: 'Tuyệt', onPress: onDismiss }}
      title={item ? `Lên cấp ${item.to}!` : ''}
      variant="success"
      visible={item !== null}
      onClose={onDismiss}
    >
      {item ? (
        <View className="gap-sm">
          <LevelUpConfetti />
          {xpToNext !== undefined && xpToNext > 0 ? (
            <Text className="text-center text-body-md text-fg-2">
              {`Còn ${formatXp(xpToNext)} để lên cấp ${item.to + 1}`}
            </Text>
          ) : null}
          {item.badges.length > 0 ? (
            <View className="gap-2xs">
              <Text className="text-center text-label-md text-fg-1">Huy hiệu mới</Text>
              {item.badges.map((badge) => (
                <Text key={badge.id} className="text-center text-body-md text-fg-1">
                  {`${badge.emoji ?? '🏅'} ${badge.name}`}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </Dialog>
  );
}
