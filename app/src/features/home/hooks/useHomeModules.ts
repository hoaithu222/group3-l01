import { useCallback, useMemo } from 'react';

import { hapticTap, hapticWarning } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';
import { MAX_PINNED_MODULES, MIN_MODULES_FOR_HERO } from '@/shell/navigation/module-pins.store';
import { openModule } from '@/shell/navigation/open-module';
import { pinFeedback, toggleModulePin } from '@/shell/navigation/toggle-module-pin';
import type { ModuleConfig } from '@/shell/navigation/types';
import { useAccessibleModules } from '@/shell/navigation/use-accessible-modules';
import { useModulePrefs } from '@/shell/navigation/use-module-prefs';
import { useTabBadges } from '@/shell/notifications';

import { splitHomeModules } from '../utils/module-ranking.utils';

export interface HomeModules {
  /** Số chưa đọc của một phân hệ (chỉ phân hệ khai `badge` mới có); `undefined` = không có gì để hiện. */
  badgeOf: (module: ModuleConfig) => number | undefined;
  /** Ghim được không: đã nạp xong sở thích VÀ Trang chủ có tách tầng hero (ghim mới có chỗ hiện). */
  canPin: boolean;
  /** Tầng 1 — thẻ lớn: phân hệ ĐÃ GHIM trước, rồi tới xếp hạng/thứ tự khai báo. */
  heroes: ModuleConfig[];
  /** Chưa nạp xong ghim + lượt mở: đừng vẽ thứ tự tạm rồi để nó nhảy. */
  loading: boolean;
  /** Toàn bộ phân hệ được vào (chính + phụ), thứ tự khai báo. */
  modules: ModuleConfig[];
  onOpen: (module: ModuleConfig) => void;
  onTogglePin: (module: ModuleConfig) => void;
  /** `id` các thẻ hero đang GHIM thật (thẻ hero điền mặc định không có mặt ở đây). */
  pinnedIds: ReadonlySet<string>;
  /** Tầng 2 — lưới: phần còn lại, thứ tự khai báo. */
  rest: ModuleConfig[];
}

/**
 * Dữ liệu cho khu phân hệ của Trang chủ: phân hệ người dùng được vào → tách hero / lưới theo ghim + xếp hạng.
 *
 * Trang chủ chỉ đọc VỎ ỨNG DỤNG (`@/shell/*`), không import feature khác: registry + quyền/cờ ở
 * `useAccessibleModules`, số chưa đọc ở `useTabBadges`, ghim/lượt mở ở `useModulePrefs`.
 */
export function useHomeModules(): HomeModules {
  const modules = useAccessibleModules();
  const { pinned, ranking, ready } = useModulePrefs();
  const badges = useTabBadges();

  const availableIds = useMemo(() => modules.map((module) => module.id), [modules]);

  const { heroes, rest } = useMemo(
    () =>
      splitHomeModules(modules, pinned, ranking, {
        minModules: MIN_MODULES_FOR_HERO,
        slots: MAX_PINNED_MODULES,
      }),
    [modules, pinned, ranking],
  );

  const pinnedIds = useMemo(
    () => new Set(heroes.filter((module) => pinned.includes(module.id)).map((module) => module.id)),
    [heroes, pinned],
  );

  const badgeOf = useCallback(
    (module: ModuleConfig) => (module.name ? badges[module.name] : undefined),
    [badges],
  );

  const onTogglePin = useCallback(
    (module: ModuleConfig) => {
      const result = toggleModulePin(module.id, availableIds);
      // Nhấn giữ để ghim là cử chỉ ẨN — rung là xác nhận ĐẦU TIÊN người dùng cảm nhận được: ghim/bỏ ghim ⇒ nhịp "chạm", chạm
      // trần ⇒ nhịp "bị chặn" (đi cùng toast bên dưới). Chưa nạp xong sở thích thì không có gì xảy ra ⇒ không rung.
      if (result === 'full') hapticWarning();
      else if (result !== 'not-ready') hapticTap();
      const feedback = pinFeedback(result, module.title);
      // Nhấn giữ là cử chỉ ẨN: bị chặn (đủ số ô) mà không nói gì thì người dùng tưởng máy đơ.
      if (feedback) showToast(feedback.tone, feedback.message);
    },
    [availableIds],
  );

  return {
    badgeOf,
    canPin: ready && heroes.length > 0,
    heroes,
    loading: !ready,
    modules,
    onOpen: openModule,
    onTogglePin,
    pinnedIds,
    rest,
  };
}
