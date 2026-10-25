/** Mã lỗi BE (404) khi cờ phân hệ `project` (Resource Hub đi theo cờ này) đang tắt. */
export const RESOURCE_FEATURE_OFF_CODE = 'CFG_005';

/**
 * Nhãn loại tệp (`ResourceType` phía BE). Loại chưa khai → hiện chính mã (`resourceTypeLabel`),
 * nên BE thêm loại mới thì UI vẫn đọc được, chỉ chưa đẹp.
 */
export const RESOURCE_TYPE_LABELS: Readonly<Record<string, string>> = {
  PDF: 'PDF',
  IMAGE: 'Ảnh',
  VIDEO: 'Video',
  AUDIO: 'Âm thanh',
  CODE: 'Mã nguồn',
  DOC: 'Tài liệu văn bản',
  SHEET: 'Bảng tính',
  SLIDE: 'Trình chiếu',
  TEXT: 'Văn bản thuần',
  OTHER: 'Khác',
};

/**
 * Mã hành động hiện ở khối "Nhật ký hạn mức kho tài liệu" (p3-01 admin.md §2.1) — BE ghi cả hai với
 * `targetType: "WORKSPACE"` (`resource-purge.service.ts`, `resource-admin.service.ts`).
 */
export const RESOURCE_AUDIT_ACTIONS: readonly string[] = [
  'resource.purge',
  'resource.quota-override',
];

/** Khoảng hạn mức riêng cho phép, tính bằng GiB — khớp registry `resource.quotaOverrides` phía BE. */
export const QUOTA_GIB_MIN = 0.5;
export const QUOTA_GIB_MAX = 100;

/** Ngưỡng đổi màu thanh dung lượng: từ 70% cảnh báo, từ 90% nguy hiểm. */
export const USAGE_WARNING_PERCENT = 70;
export const USAGE_DANGER_PERCENT = 90;
