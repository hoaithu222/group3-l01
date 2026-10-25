import { useState } from 'react';

import { hapticSelection, hapticSuccess, hapticWarning } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import type { BadgeDto } from '../api/gamification.types';
import { SHOWCASE_MAX } from '../constants/gamification.constants';
import { useSetShowcase } from '../queries/gamification.queries';
import { gamificationErrorMessage } from '../utils/level-math';

/**
 * Bản nháp trưng bày ở chế độ "Chỉnh trưng bày" (app.md p4-03 §4): danh sách id THEO THỨ TỰ; chỉ khi bấm Lưu mới gửi
 * `PUT /me/badges/showcase` (lạc quan + rollback nằm ở `useSetShowcase`). `draft === null` ⇒ không ở chế độ chỉnh.
 */
export function useShowcaseDraft(currentIds: string[]) {
  const setShowcase = useSetShowcase();
  const [draft, setDraft] = useState<string[] | null>(null);

  const toggle = (badge: BadgeDto) => {
    // Rung theo kết quả của cú chạm: chọn/bỏ chọn ⇒ nhịp "đổi lựa chọn"; đã đủ 6 mà chọn thêm ⇒ nhịp "bị chặn" (đi cùng toast
    // cảnh báo bên dưới). Đọc `draft` của lần vẽ này — ⛔ không rung TRONG hàm cập nhật state (phải thuần, StrictMode gọi hai lần).
    const picked = draft ?? [];
    if (!picked.includes(badge.id) && picked.length >= SHOWCASE_MAX) hapticWarning();
    else hapticSelection();
    setDraft((current) => {
      const ids = current ?? [];
      if (ids.includes(badge.id)) return ids.filter((id) => id !== badge.id);
      if (ids.length >= SHOWCASE_MAX) {
        showToast('warning', `Chỉ trưng bày tối đa ${SHOWCASE_MAX} huy hiệu`);
        return ids;
      }
      return [...ids, badge.id];
    });
  };

  const move = (badgeId: string, delta: -1 | 1) =>
    setDraft((current) => {
      const ids = [...(current ?? [])];
      const from = ids.indexOf(badgeId);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= ids.length) return current;
      [ids[from], ids[to]] = [ids[to] as string, ids[from] as string];
      return ids;
    });

  const remove = (badgeId: string) =>
    setDraft((current) => (current ? current.filter((id) => id !== badgeId) : current));

  const save = () => {
    if (!draft) return;
    setShowcase.mutate(draft, {
      onError: (error) =>
        showToast('error', gamificationErrorMessage(error, 'Chưa lưu được trưng bày, thử lại')),
      onSuccess: () => {
        hapticSuccess();
        setDraft(null);
        showToast('success', 'Đã cập nhật huy hiệu trưng bày');
      },
    });
  };

  return {
    cancel: () => setDraft(null),
    draft,
    editing: draft !== null,
    isSaving: setShowcase.isPending,
    move,
    remove,
    save,
    start: () => setDraft(currentIds),
    toggle,
  };
}
