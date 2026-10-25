import { useMemo } from 'react';

import type { ModuleConfig } from '@/app/router/modules';
import { useModerationOpenCount } from '@/features/moderation/hooks/useModerationOpenCount';

/** Số việc chờ theo mục menu — `undefined` = chưa biết (không hiện chấm), khác `0` (biết là hết việc). */
export interface ModuleBadge {
  count: number;
  /** Câu đọc cho trình đọc màn hình ("12 báo cáo chờ xử lý"). */
  label: string;
}

/** Khoá bộ đếm trực tiếp mà `ModuleConfig.badge` (chuỗi) có thể trỏ tới. */
const BADGE_MODERATION_OPEN = 'moderation-open';

/**
 * Chấm số việc chờ của các mục menu.
 *
 * `ModuleConfig.badge`: SỐ ⇒ hiện nguyên số; CHUỖI ⇒ khoá của một bộ đếm trực tiếp, giải ở đây (registry
 * chỉ khai TÊN — không import feature, xem `docs/rules/routing-conventions.md`). Mỗi bộ đếm chỉ chạy khi
 * có ít nhất một mục ĐANG HIỆN ở menu khai khoá đó — `modules` đã lọc quyền + cờ tính năng
 * (`useAccessibleModules`), nên người không có quyền/cờ tắt không mở phòng socket hay gọi API.
 *
 * Trả `{ [moduleId]: ModuleBadge }` chỉ với mục có chấm (đếm > 0).
 */
export function useModuleBadges(modules: readonly ModuleConfig[]): Readonly<Record<string, ModuleBadge>> {
  const moderationOpen = useModerationOpenCount(
    modules.some((m) => m.badge === BADGE_MODERATION_OPEN),
  );

  return useMemo(() => {
    const out: Record<string, ModuleBadge> = {};
    for (const m of modules) {
      if (typeof m.badge === 'number' && m.badge > 0) {
        out[m.id] = { count: m.badge, label: `${m.badge} mục đang chờ` };
      } else if (m.badge === BADGE_MODERATION_OPEN && moderationOpen && moderationOpen > 0) {
        out[m.id] = { count: moderationOpen, label: `${moderationOpen} báo cáo chờ xử lý` };
      }
    }
    return out;
  }, [modules, moderationOpen]);
}
