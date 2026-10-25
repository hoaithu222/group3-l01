/**
 * Danh mục hành động của UserMenu — ĐƠN TENANT.
 *
 * ⛔ KHÔNG có mục chuyển tổ chức / dự án / phòng ban: base project là đơn
 *    tenant, RBAC phẳng. Thêm mục mới thì khai ở đây, đừng rải trong JSX.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * HAI LOẠI MỤC — đọc trước khi thêm key mới
 * ─────────────────────────────────────────────────────────────────────────
 *  1. MỤC TĨNH (`USER_MENU_ACTIONS` bên dưới) — nhãn + icon cố định, KHÔNG
 *     phụ thuộc state nào. Bấm vào là `<UserMenu>` gọi thẳng `onSelect(key)`
 *     để tầng `app/` điều hướng (xem `AppHeader.tsx`).
 *
 *  2. MỤC ĐỘNG (khai trong `useUserMenuOptions.ts`) — nhãn/icon ĐỔI THEO
 *     state (đang sáng hay tối, Dock đang ẩn hay hiện, kiểu header nào đang
 *     bật) nên không đặt cạnh mảng tĩnh được.
 *
 *     ⛔ MỤC ĐỘNG XỬ LÝ TẠI CHỖ, KHÔNG BAO GIỜ đi ra `onSelect`. `AppHeader`
 *        nhận mọi key lạ và điều hướng sang trang Cài đặt — để lọt một key
 *        động ra ngoài là bấm "Ẩn thanh Dock" xong bị nhảy trang. Xem nhánh
 *        `handleSelect` trong `useUserMenuOptions.ts`.
 *
 * ⛔ KHÔNG XOÁ / ĐỔI TÊN ba key tĩnh (`profile` · `change-password` ·
 *    `logout`): `AppHeader.tsx` phân nhánh trực tiếp trên chúng. Chỉ được THÊM.
 */
import type { SystemIconName } from '@/shared/ui';

/** Mục có nhãn cố định — đi ra `onSelect` cho tầng app xử lý. */
export type UserMenuStaticKey = 'profile' | 'change-password' | 'logout';

/** Mục tự xử lý bên trong widget — KHÔNG bao giờ đi ra `onSelect`. */
export type UserMenuDynamicKey = 'toggle-theme' | 'toggle-dock' | 'cycle-header-layout';

export type UserMenuKey = UserMenuStaticKey | UserMenuDynamicKey;

export interface UserMenuActionConfig {
  key: UserMenuStaticKey;
  label: string;
  icon: SystemIconName;
  /** Tông nguy hiểm — icon + nhãn đỏ. */
  danger?: boolean;
}

export const USER_MENU_ACTIONS: readonly UserMenuActionConfig[] = [
  { key: 'profile', label: 'Hồ sơ cá nhân', icon: 'user-outline' },
  { key: 'change-password', label: 'Đổi mật khẩu', icon: 'lock-outline' },
  // Registry icon chưa có `right-from-bracket`; `arrow-right-to-line` là biểu
  // tượng "ra khỏi" gần nhất đang có. Export SVG mới rồi chạy
  // `npm run generate:icons` nếu muốn đổi.
  { key: 'logout', label: 'Đăng xuất', icon: 'arrow-right-to-line-outline', danger: true },
] as const;
