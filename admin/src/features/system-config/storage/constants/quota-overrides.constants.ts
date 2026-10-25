/** Khoá registry của hạn mức kho tài liệu RIÊNG theo nhóm (`resource.quotaOverrides`, p3-01). */
export const RESOURCE_CONFIG_KEY = 'resource';

/** Khoảng hạn mức riêng 0,5–100 GiB — khớp schema `resource.quotaOverrides` phía BE. */
export const QUOTA_GIB_MIN = 0.5;
export const QUOTA_GIB_MAX = 100;

/** Số nhóm tối đa có hạn mức riêng — khớp `.max(500)` của schema phía BE. */
export const QUOTA_OVERRIDES_MAX = 500;

/** `/workspace` viết cứng CÓ CHỦ ĐÍCH — import `MODULE_PATHS`/`module-registry.ts` từ đây khép vòng (`check:cycles`). */
export const WORKSPACE_MODULE_PATH = '/workspace';
