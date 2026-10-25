import { Text, View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { Sparkles } from '@/shared/ui/effects';
import { Icon } from '@/shared/ui/icon';
import { cn } from '@/shared/utils/style/cn';
import { showToast } from '@/shared/utils/toast.utils';

import type { BadgeDto } from '../api/gamification.types';
import { RARITY_LABELS, SHOWCASE_MAX } from '../constants/gamification.constants';
import { useMyGamification, useSetShowcase } from '../queries/gamification.queries';
import { badgeStatusText, clauseText } from '../utils/badge-format';
import { gamificationErrorMessage } from '../utils/level-math';

export interface BadgeDetailSheetProps {
  /** `null` ⇒ ẩn. */
  badge: BadgeDto | null;
  onClose: () => void;
}

/**
 * Chi tiết một huy hiệu (app.md p4-03 §3): emoji, tên, độ hiếm, mô tả, tiến độ TỪNG điều kiện (chữ), ngày đạt, nút
 * Trưng bày / Bỏ trưng bày. Nút chỉ có với huy hiệu ĐÃ đạt; thêm vào cuối danh sách trưng bày hiện tại (đổi thứ tự ở chế
 * độ "Chỉnh trưng bày"). Lỗi `GAME_006` (chưa đạt / quá 6) hiện bằng câu tiếng Việt của feature; offline ⇒ khoá nút.
 */
export function BadgeDetailSheet({ badge, onClose }: BadgeDetailSheetProps) {
  const me = useMyGamification();
  const setShowcase = useSetShowcase();
  const offline = useConnectionState() === 'offline';
  const showcaseIds = me.data?.showcase.map((item) => item.id) ?? [];
  const unlocked = Boolean(badge?.unlockedAt);
  const inShowcase = badge ? showcaseIds.includes(badge.id) : false;
  const full = !inShowcase && showcaseIds.length >= SHOWCASE_MAX;

  const toggleShowcase = () => {
    if (!badge) return;
    const next = inShowcase
      ? showcaseIds.filter((id) => id !== badge.id)
      : [...showcaseIds, badge.id];
    setShowcase.mutate(next, {
      onError: (error) =>
        showToast('error', gamificationErrorMessage(error, 'Chưa lưu được trưng bày, thử lại')),
      onSuccess: () => {
        showToast('success', inShowcase ? 'Đã bỏ trưng bày huy hiệu' : 'Đã trưng bày huy hiệu');
        onClose();
      },
    });
  };

  return (
    <BottomSheet
      footer={
        unlocked ? (
          <View className="gap-xs">
            {full ? (
              <Text className="text-center text-caption-lg text-fg-2">
                {`Đã trưng bày đủ ${SHOWCASE_MAX} huy hiệu — bỏ bớt một huy hiệu để thêm`}
              </Text>
            ) : null}
            {offline ? (
              <Text className="text-center text-caption-lg text-fg-2">
                Cần kết nối mạng để đổi huy hiệu trưng bày
              </Text>
            ) : null}
            <Button
              disabled={offline || full}
              fullWidth
              label={inShowcase ? 'Bỏ trưng bày' : 'Trưng bày'}
              loading={setShowcase.isPending}
              variant={inShowcase ? 'secondary' : 'primary'}
              onPress={toggleShowcase}
            />
          </View>
        ) : undefined
      }
      scrollable
      title={badge?.name ?? ''}
      visible={badge !== null}
      onClose={onClose}
    >
      {badge ? (
        <View className="items-center gap-sm py-xs">
          {/* ✅ Đã đạt ⇒ vài ngôi sao lấp lánh quanh emoji (nhỏ, không tính vào ngân sách vòng lặp; tự tắt khi "Giảm
              chuyển động" và khi tấm đóng). Chưa đạt ⇒ emoji mờ, không sao — trạng thái vẫn nằm ở CHỮ bên dưới. */}
          <View
            accessibilityElementsHidden
            className="relative px-xs"
            importantForAccessibility="no-hide-descendants"
          >
            <Text className={cn('text-display', !unlocked && 'opacity-40')}>
              {badge.emoji ?? '🏅'}
            </Text>
            {unlocked ? <Sparkles className="-inset-3" count={4} size={12} /> : null}
          </View>
          <Text className="text-label-md text-fg-2">{RARITY_LABELS[badge.rarity]}</Text>
          <Text className="self-stretch text-body-md text-fg-1">{badge.description}</Text>
          {/* Dấu tick / ổ khoá + chữ: MÀU xanh không phải dấu hiệu duy nhất của "đã đạt". */}
          <View className="flex-row items-center gap-xs self-stretch">
            <Icon
              color={unlocked ? 'success' : 'fg-2'}
              name={unlocked ? 'checkmark-circle' : 'lock'}
              size="sm"
            />
            <Text
              className={
                unlocked ? 'flex-1 text-label-md text-success' : 'flex-1 text-label-md text-fg-2'
              }
            >
              {badgeStatusText(badge)}
            </Text>
          </View>
          {!unlocked && badge.progress && badge.progress.length > 0 ? (
            <View className="gap-2xs self-stretch">
              <Text className="text-label-md text-fg-1">Điều kiện để đạt</Text>
              {badge.progress.map((clause) => (
                <Text key={clause.counter} className="text-body-md text-fg-2">
                  {clauseText(clause)}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </BottomSheet>
  );
}
