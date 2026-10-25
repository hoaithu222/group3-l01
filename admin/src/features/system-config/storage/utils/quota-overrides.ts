import type { SystemConfigItem } from '../../types/system-config.types';
import { readPath } from '../../utils/config-fields';
import type { QuotaOverridesFormValues, QuotaOverrideRow } from '../schemas/quota-overrides.schema';

const GIB = 1024 ** 3;

/** Đường dẫn field json trong `value` của khoá `resource`. */
const OVERRIDES_PATH = 'quotaOverrides';

const bytesToGib = (bytes: number): number => Math.round((bytes / GIB) * 100) / 100;
const gibToBytes = (gib: number): number => Math.round(gib * GIB);

/** Đọc danh sách hạn mức riêng từ giá trị server; phần tử hỏng bị bỏ qua thay vì làm vỡ form. */
export function readOverrides(raw: unknown): QuotaOverrideRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((o): QuotaOverrideRow[] => {
    if (!o || typeof o !== 'object') return [];
    const r = o as Record<string, unknown>;
    if (typeof r.workspaceId !== 'string' || typeof r.bytes !== 'number') return [];
    return [{ workspaceId: r.workspaceId, gib: bytesToGib(r.bytes) }];
  });
}

/** Giá trị form từ giá trị HIỆU LỰC của server. */
export const toOverridesForm = (item: SystemConfigItem): QuotaOverridesFormValues => ({
  overrides: readOverrides(readPath(item.effective, OVERRIDES_PATH)),
});

/** Phần `value` gửi PUT: chỉ field json `quotaOverrides` (khoá lạ đã lưu do hook giữ nguyên). */
export function overridesPatch(values: QuotaOverridesFormValues): Record<string, unknown> {
  return {
    [OVERRIDES_PATH]: values.overrides.map((o) => ({
      workspaceId: o.workspaceId,
      bytes: gibToBytes(o.gib),
    })),
  };
}

/**
 * Mô tả thay đổi cho hộp thoại xác nhận: bao nhiêu nhóm bị bỏ hạn mức riêng (về mặc định) và bao nhiêu
 * nhóm đổi giá trị. Form không cho thêm nhóm mới nên không có nhánh "thêm".
 */
export function describeOverrideChange(
  before: readonly QuotaOverrideRow[],
  after: readonly QuotaOverrideRow[],
): string {
  const beforeGib = new Map(before.map((o) => [o.workspaceId, o.gib]));
  const afterIds = new Set(after.map((o) => o.workspaceId));
  const removed = before.filter((o) => !afterIds.has(o.workspaceId)).length;
  const changed = after.filter(
    (o) => beforeGib.has(o.workspaceId) && beforeGib.get(o.workspaceId) !== o.gib,
  ).length;
  const parts = [
    removed > 0 ? `${removed} nhóm về hạn mức mặc định` : null,
    changed > 0 ? `${changed} nhóm đổi hạn mức` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Không có thay đổi';
}
