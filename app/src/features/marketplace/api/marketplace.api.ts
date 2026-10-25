/**
 * Đường dẫn endpoint chợ tài liệu (p7-02 P1; `be/src/modules/coins/marketplace.routes.ts`). Mọi route đi qua `requireFeature('coins')` (404 `CFG_005`
 * khi tắt) RỒI `SystemConfig economy.marketplaceEnabled` (400/403 `COIN_008` khi chợ chưa mở — mặc định TẮT, chờ điều khoản bản quyền). `GET /study-sets`
 * dùng lại của feature `study` — gọi THẲNG endpoint (không import `@/features/study`, `feature-structure.md` "không import chéo feature").
 */
export const MARKETPLACE_LISTINGS_PATH = '/marketplace/listings';
export const ME_LISTINGS_PATH = '/me/listings';
export const ME_PURCHASES_PATH = '/me/purchases';
/** Nội dung đủ điều kiện niêm yết — bộ học PUBLIC của tôi (lọc ở máy, danh sách nhỏ). */
export const MY_STUDY_SETS_PATH = '/study-sets';

export const listingDetailPath = (id: string) => `${MARKETPLACE_LISTINGS_PATH}/${id}`;
export const listingBuyPath = (id: string) => `${MARKETPLACE_LISTINGS_PATH}/${id}/buy`;
export const listingReportPath = (id: string) => `${MARKETPLACE_LISTINGS_PATH}/${id}/report`;
