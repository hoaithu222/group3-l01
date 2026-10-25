import { useEffect } from 'react';

import { useAuthStore } from '@/shell/store/slices/auth';

import { useModulePinsStore } from './module-pins.store';
import { useModuleUsageStore, type ModuleUsageMap } from './module-usage.store';

const NO_PINS: readonly string[] = [];
const NO_USAGE: ModuleUsageMap = {};

export interface ModulePrefs {
  /** `id` phân hệ đã ghim, THEO THỨ TỰ ghim. Rỗng khi chưa `ready`. */
  pinned: readonly string[];
  /** Bảng lượt mở ĐÓNG BĂNG cho phiên này (xem `module-usage.store`). Rỗng khi chưa `ready`. */
  ranking: ModuleUsageMap;
  /** Đã nạp xong ghim + lượt dùng CỦA NGƯỜI ĐANG ĐĂNG NHẬP. `false` ⇒ đừng vẽ thứ tự tạm rồi để nó nhảy. */
  ready: boolean;
}

/**
 * Nạp sở thích phân hệ (ghim + lượt mở) của người đang đăng nhập và trả về bản CỦA ĐÚNG NGƯỜI ĐÓ.
 *
 * ── Vì sao hook này, không phải nạp ở đâu đó một lần ─────────────────────────
 * Dữ liệu theo NGƯỜI DÙNG (`u:<userId>:*`), mà người dùng đổi giữa phiên (đăng xuất → người khác đăng nhập, hoặc
 * `wipeUserData()` xoá bản trong bộ nhớ). Effect phụ thuộc cả `userId` lẫn chủ dữ liệu đang giữ nên tự nạp lại đúng
 * lúc cần. `hydrate` tự bỏ qua khi đã nạp cho đúng người ⇒ Trang chủ và `ModulePickerSheet` cùng gọi hook này an toàn.
 *
 * ⛔ `ready` so cả CHỦ dữ liệu với `userId` hiện tại: giữa lúc đổi người và lúc đĩa trả lời, bản trong bộ nhớ vẫn là của
 * người cũ — trả nó ra là lộ ghim của người trước cho người sau.
 */
export function useModulePrefs(): ModulePrefs {
  const userId = useAuthStore((state) => state.user?.id ?? null);

  const pinsOwner = useModulePinsStore((state) => state.ownerId);
  const pinsHydrated = useModulePinsStore((state) => state.hydrated);
  const pinned = useModulePinsStore((state) => state.pinned);
  const hydratePins = useModulePinsStore((state) => state.hydrate);

  const usageOwner = useModuleUsageStore((state) => state.ownerId);
  const usageHydrated = useModuleUsageStore((state) => state.hydrated);
  const ranking = useModuleUsageStore((state) => state.ranking);
  const hydrateUsage = useModuleUsageStore((state) => state.hydrate);

  useEffect(() => {
    void hydratePins(userId);
    void hydrateUsage(userId);
  }, [hydratePins, hydrateUsage, pinsOwner, usageOwner, userId]);

  const ready = pinsHydrated && pinsOwner === userId && usageHydrated && usageOwner === userId;
  return ready ? { pinned, ranking, ready } : { pinned: NO_PINS, ranking: NO_USAGE, ready };
}
