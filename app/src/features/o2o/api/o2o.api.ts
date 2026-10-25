/**
 * Đường dẫn endpoint In ấn O2O (p6-05 be.md §4) — nối sau `appConfig.apiBaseUrl`.
 * `grep` một lần ở đây là thấy hết mặt tiếp xúc backend của feature. Phía tiệm (`/partner/*`) và vận hành (`/admin/*`) KHÔNG dùng ở app.
 */

export const LOCATIONS_NEAR_PATH = '/locations/near';
export const locationPath = (locationId: string) => `/locations/${locationId}`;
export const locationReviewsPath = (locationId: string) => `${locationPath(locationId)}/reviews`;
export const myReviewPath = (locationId: string) => `${locationReviewsPath(locationId)}/me`;

export const printShopPath = (shopId: string) => `/print-shops/${shopId}`;
export const printShopQuotePath = (shopId: string) => `${printShopPath(shopId)}/quote`;

export const PRINT_ORDERS_PATH = '/print-orders';
export const printOrderPath = (orderId: string) => `${PRINT_ORDERS_PATH}/${orderId}`;
export const printOrderSubmitPath = (orderId: string) => `${printOrderPath(orderId)}/submit`;
export const printOrderCancelPath = (orderId: string) => `${printOrderPath(orderId)}/cancel`;
/** Tên "reveal" của BE nhưng thực chất là TẠO PIN MỚI (PIN cũ vô hiệu) — BE không bao giờ trả lại PIN cũ. */
export const printOrderPinPath = (orderId: string) => `${printOrderPath(orderId)}/pin/reveal`;
