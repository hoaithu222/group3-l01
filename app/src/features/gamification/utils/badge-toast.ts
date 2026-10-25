import { router } from 'expo-router';

import { useToastStore } from '@/shared/ui/feedback/toast-store';

import type { NewBadgeSummary } from '../api/gamification.types';

/**
 * Toast "Huy hiệu mới" (app.md p4-03 §2 `BadgeUnlockedToast`) qua HỆ TOAST CHUNG — `ToastHost` đã mount ở gốc cây và
 * dặn "đừng dựng hệ toast thứ hai". Nút "Xem" mở `/me/achievements`; nhiều huy hiệu cùng lúc gộp thành MỘT toast (trần
 * 3 toast hiện cùng lúc của kho — mở 4 huy hiệu một lượt sẽ đẩy nhau ra).
 */
export function notifyBadgesUnlocked(badges: readonly NewBadgeSummary[]): void {
  const [first] = badges;
  if (!first) return;
  const label = `${first.emoji ?? '🏅'} ${first.name}`;
  const message =
    badges.length === 1
      ? `Huy hiệu mới: ${label}`
      : `Bạn vừa mở ${badges.length} huy hiệu mới, trong đó có ${label}`;
  useToastStore.getState().show('success', message, {
    action: { label: 'Xem', onPress: () => router.push('/me/achievements') },
  });
}
