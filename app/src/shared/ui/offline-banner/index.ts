/**
 * Barrel của nhóm `offline-banner` (p0-12).
 *
 * ⛔ KHÔNG nối vào `src/shared/ui/index.ts` — cùng lý do `connection-banner/`: banner ngoại tuyến là thứ đặt MỘT chỗ có chủ ý
 * (ngoài `(app)`); đưa vào barrel tổng là mời màn hình nào cũng tự thêm một bản, và trong `(app)` thì trùng `ConnectionBanner`.
 * Nhập thẳng `@/shared/ui/offline-banner`.
 */
export { OfflineBanner } from './OfflineBanner';
export type { OfflineBannerProps } from './OfflineBanner';
