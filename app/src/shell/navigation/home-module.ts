import type { IconName } from '@/shared/ui/icon';

/**
 * Nút TRANG CHỦ ở giữa thanh tab — KHÔNG thuộc `MODULE_REGISTRY` vì nó không phải một phân hệ
 * (không cờ, không quyền, không nằm trong danh sách chọn phân hệ) mà là điểm vào của cả app.
 *
 * ⛔ `name: 'index'` trùng `app/(app)/index.tsx` — chính màn Trang chủ. `PATHS.HOME` (`'/'`) là chỗ
 * đăng nhập xong, "Về trang chủ" và mọi `<Redirect>` cùng trỏ tới, nên không cần đổi nơi nào khác.
 *
 * Tách khỏi `module-registry.ts` (p0-12) cho file đó ≤ 150 dòng; vẫn được re-export ở đó nên nơi gọi
 * cũ (`import { HOME_MODULE } from '@/shell/navigation/module-registry'`) không đổi.
 */
export const HOME_MODULE: { href: '/'; icon: IconName; id: 'home'; name: 'index'; title: string } =
  {
    href: '/',
    icon: 'home',
    id: 'home',
    name: 'index',
    title: 'Trang chủ',
  };
