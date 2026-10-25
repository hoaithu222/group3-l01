/**
 * Giới hạn ảnh huy hiệu — khớp `LIMITS.upload.scopeRestrict.BADGE` của BE (`be/src/core/constants/limits.ts`, p4-03 be.md §13):
 * CHỈ PNG/WebP ≤ 512 KiB; KHÔNG SVG (chạy được script khi mở trực tiếp), JPEG, GIF. BE kiểm lại và trả `ASSET_001`/`ASSET_002`.
 */
export const BADGE_ICON_ACCEPT = 'image/png,image/webp';

/** `FileField.maxSize` tính bằng MB: 0,5 MB = 512 KiB. */
export const BADGE_ICON_MAX_MB = 0.5;

/** Tên hiển thị của ảnh đang dùng khi sửa huy hiệu (BE không trả tên tệp gốc trong `BadgeAdminDto`). */
export const BADGE_ICON_CURRENT_NAME = 'Ảnh huy hiệu hiện tại';
