import type { Href } from 'expo-router';

/**
 * Đường dẫn màn của feature. Route nằm dưới `app/(app)/me/marketplace/**` (KHÔNG phải `(app)/marketplace/**` như app.md gợi ý ban đầu): thư mục MỚI
 * cấp `(app)/` bị Expo Router tự dựng thành TAB (cùng lý do `features/coins` gộp vào `me/coins/*` thay vì `(app)/coins/*` — xem
 * `app/(app)/me/coins/_layout.tsx`). app.md "Không thêm tab" ⇒ nối vào ngăn xếp "Tôi" như coins.
 *
 * ⛔ Mỗi hằng `satisfies Href` — KHÔNG `cond ? a : b` tạo `Href` trong một biểu thức (TS2590, xem `features/coins/utils/coins-routes.ts`).
 */
export const MARKETPLACE_HREF = '/me/marketplace' satisfies Href;
export const MARKETPLACE_NEW_HREF = '/me/marketplace/new' satisfies Href;
export const MARKETPLACE_MINE_HREF = '/me/marketplace/mine' satisfies Href;

/** Chi tiết listing — route động, dùng `router.push(listingDetailHref(id))` (khớp mẫu `pathname/params` của Expo Router typed routes). */
export const listingDetailHref = (listingId: string) =>
  ({ pathname: '/me/marketplace/[listingId]', params: { listingId } }) as const;
