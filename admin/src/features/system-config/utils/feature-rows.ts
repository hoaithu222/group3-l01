import type { Capabilities } from '@/core/capabilities';

import { SUB_FEATURE_PARENT, SUB_FEATURE_UNAVAILABLE_REASONS } from '../constants/sub-features';
import type { SystemConfigItem } from '../types/system-config.types';

/** Một dòng bảng "Tính năng" — hợp `features` (config) với `/capabilities`. */
export interface FeatureRow {
  id: string;
  label: string;
  enabled: boolean;
  available: boolean;
  blocked: boolean;
  overridden: boolean;
  /** Chỉ cờ PHỤ của tiện ích (p5-04): id phân hệ cha (`communication`). Bỏ trống = chính là một phân hệ. */
  parentId?: string;
  parentLabel?: string;
  /** Chỉ cờ phụ: phân hệ cha đang BẬT (cờ phụ vô hiệu khi cha tắt). */
  parentEnabled?: boolean;
  /** Chỉ cờ phụ: phân hệ cha CÓ MÃ — cờ phụ vẫn `available=false` thì thiếu hạ tầng riêng (vd ghi hình cần S3 + Egress). */
  parentAvailable?: boolean;
}

export interface PendingToggle {
  row: FeatureRow;
  next: boolean;
}

/**
 * Nguồn: danh sách phân hệ từ `/admin/system-config` (nhãn, phần override đã
 * lưu) HỢP với `/capabilities` (`enabled` cuối cùng + `available`/`blocked` —
 * thứ chỉ BE biết). Cờ phụ của tiện ích (`SUB_FEATURE_PARENT`) mang thêm thông tin phân hệ cha.
 */
export function buildFeatureRows(
  item: SystemConfigItem,
  caps: Capabilities | undefined,
): FeatureRow[] {
  return item.fields.map((f) => {
    const cap = caps?.features[f.path];
    const parentId = SUB_FEATURE_PARENT[f.path];
    return {
      id: f.path,
      label: f.label,
      enabled: Boolean(cap?.enabled),
      available: Boolean(cap?.available),
      blocked: Boolean(cap?.blocked),
      overridden: item.stored[f.path] !== undefined,
      ...(parentId && {
        parentId,
        parentLabel: item.fields.find((p) => p.path === parentId)?.label ?? parentId,
        parentEnabled: Boolean(caps?.features[parentId]?.enabled),
        parentAvailable: Boolean(caps?.features[parentId]?.available),
      }),
    };
  });
}

/** Tách phân hệ với cờ phụ của tiện ích (giữ nguyên thứ tự của mỗi nhóm) — cờ phụ hiện thành nhóm riêng bên dưới. */
export function splitFeatureRows(rows: FeatureRow[]): {
  modules: FeatureRow[];
  subs: FeatureRow[];
} {
  return {
    modules: rows.filter((r) => !r.parentId),
    subs: rows.filter((r) => r.parentId),
  };
}

/** Nhóm cờ phụ theo phân hệ cha (giữ thứ tự xuất hiện) — mỗi nhóm hiện thành một bảng riêng dưới tên phân hệ. */
export function groupSubFeatureRows(subs: FeatureRow[]): Array<{ parentId: string; rows: FeatureRow[] }> {
  const groups = new Map<string, FeatureRow[]>();
  for (const row of subs) {
    const key = row.parentId ?? '';
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups].map(([parentId, rows]) => ({ parentId, rows }));
}

/** Khoá dòng cho `Table` — `id` của phân hệ / cờ phụ. */
export const featureRowKey = (row: FeatureRow): string => row.id;

/** Tác động hiện trong hộp thoại lý do — cờ phụ của tiện ích chỉ ẩn/hiện chức năng, không đụng phân hệ. */
export function featureToggleImpact(pending: PendingToggle | null): string {
  const isSub = Boolean(pending?.row.parentId);
  if (pending && !pending.next) {
    return isSub
      ? 'Chức năng này sẽ ẩn với người dùng; dữ liệu không bị xoá.'
      : 'Người dùng đang dùng phân hệ sẽ thấy thông báo tính năng chưa bật; dữ liệu không bị xoá.';
  }
  return isSub
    ? 'Chức năng được bật cho mọi người dùng trong ≤ 60 giây.'
    : 'Phân hệ được bật cho mọi người dùng trong ≤ 60 giây.';
}

/** Lý do khoá toggle — hiện trong `Tooltip`. `null` = bật/tắt được. */
export function lockReason(row: FeatureRow, canEdit: boolean): string | null {
  if (row.blocked) return 'Tạm dừng theo quyết định dự án (D-13), không thể bật.';
  if (!row.available) {
    // Cha đã có mã mà cờ phụ vẫn không khả dụng = thiếu hạ tầng riêng của tiện ích (không phải "chưa có mã").
    if (row.parentAvailable) return SUB_FEATURE_UNAVAILABLE_REASONS[row.id] ?? 'Tiện ích chưa khả dụng trên bản triển khai này.';
    return 'Phân hệ chưa có mã trên bản triển khai này.';
  }
  if (row.parentId && !row.parentEnabled) return `Cần bật phân hệ "${row.parentLabel}" trước.`;
  if (!canEdit) return 'Bạn không có quyền sửa cấu hình.';
  return null;
}
