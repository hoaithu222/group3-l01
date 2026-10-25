import {
  DEFAULT_RESOURCE_LIMITS,
  type ResourceLimits,
} from '../constants/resource-limits.constants';

function pickPositive(source: Record<string, unknown>, key: keyof ResourceLimits): number {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_RESOURCE_LIMITS[key];
}

/**
 * Đọc `capabilities.limits.resource` (`Record<string, unknown>` — cố ý không ép
 * kiểu chi tiết ở `core/capabilities`) và rơi về mặc định TỪNG TRƯỜNG khi thiếu
 * hay sai kiểu. ⛔ Không throw: backend cũ chưa có nhóm này không phải lỗi hợp đồng.
 */
export function resolveResourceLimits(limits: unknown): ResourceLimits {
  const source =
    limits && typeof limits === 'object' ? (limits as Record<string, unknown>).resource : undefined;
  if (!source || typeof source !== 'object') return DEFAULT_RESOURCE_LIMITS;
  const raw = source as Record<string, unknown>;
  return {
    folderDepthMax: pickPositive(raw, 'folderDepthMax'),
    folderNameMax: pickPositive(raw, 'folderNameMax'),
    resourceNameMax: pickPositive(raw, 'resourceNameMax'),
    codePreviewMaxBytes: pickPositive(raw, 'codePreviewMaxBytes'),
    codePreviewMaxLines: pickPositive(raw, 'codePreviewMaxLines'),
    workspaceQuotaBytes: pickPositive(raw, 'workspaceQuotaBytes'),
    trashRetentionDays: pickPositive(raw, 'trashRetentionDays'),
  };
}
