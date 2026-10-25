import type { Href } from 'expo-router';

/**
 * Đường dẫn màn của feature — MỘT nơi để đổi. Route nằm dưới `app/(app)/me/coins/**` (KHÔNG phải `(app)/coins/**`: thư mục mới cấp `(app)/` bị
 * Expo Router tự dựng thành TAB; `me/` có `_layout.tsx` kiểu Stack nên màn con không thành tab). Tên `coins` để không nhầm với `me/payment-profiles`
 * và ví chi tiêu nhóm (`features/wallet`, p6-04) — đó là tiền THẬT, đây là xu ảo.
 *
 * ⛔ Mỗi hằng `satisfies Href` — KHÔNG `cond ? a : b` / `a ?? b` tạo `Href` trong một biểu thức: union `Href` đã vài trăm mục, TS rút gọn quá giới hạn (TS2590).
 */
export const COINS_HREF = '/me/coins' satisfies Href;
export const COINS_SHOP_HREF = '/me/coins/shop' satisfies Href;
export const COINS_INVENTORY_HREF = '/me/coins/inventory' satisfies Href;
