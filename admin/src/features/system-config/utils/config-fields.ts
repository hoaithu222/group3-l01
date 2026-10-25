import { enumOptionLabel } from '../constants/enum-labels';
import type { ConfigFieldMeta, ConfigFieldUnit } from '../types/system-config.types';

const MB = 1024 * 1024;

/** Hậu tố hiển thị theo đơn vị BE khai. `bytes` được quy MB. */
const UNIT_SUFFIX: Record<ConfigFieldUnit, string> = {
  s: 'giây',
  ms: 'ms',
  bytes: 'MB',
  count: '',
  min: 'phút',
  days: 'ngày',
};

export const unitSuffix = (unit: ConfigFieldUnit | undefined): string =>
  unit ? UNIT_SUFFIX[unit] : '';

const GIB = 1024 * MB;

/**
 * Đơn vị hiển thị của field `bytes`: trần ≥ 1 GiB (vd hạn mức kho tài liệu 0,5–100 GiB, p3-01) đọc bằng
 * GiB; còn lại MB. Quy đổi theo TRẦN chứ không theo giá trị hiện tại để đơn vị không nhảy khi gõ.
 */
const bytesDivisor = (field: ConfigFieldMeta): number =>
  field.ceil !== undefined && field.ceil >= GIB ? GIB : MB;

/** Hậu tố hiển thị của MỘT field — như `unitSuffix` nhưng biết `bytes` đang quy MB hay GiB. */
export const fieldUnitSuffix = (field: ConfigFieldMeta): string =>
  field.kind === 'bytes' && bytesDivisor(field) === GIB ? 'GiB' : unitSuffix(field.unit);

/** Số lưu (byte) → số hiển thị (MB, hoặc GiB khi trần ≥ 1 GiB) cho field `bytes`; field khác giữ nguyên. */
export const toDisplay = (field: ConfigFieldMeta, stored: number): number =>
  field.kind === 'bytes' ? Math.round((stored / bytesDivisor(field)) * 100) / 100 : stored;

/** Số hiển thị → số gửi BE. */
export const fromDisplay = (field: ConfigFieldMeta, shown: number): number =>
  field.kind === 'bytes' ? Math.round(shown * bytesDivisor(field)) : shown;

/** "Giá trị + hậu tố" dùng cho hint/diff, vd `4000`, `60 giây`, `25 MB`, `Bật`, `Tắt thông báo`. */
export function formatFieldValue(field: ConfigFieldMeta, stored: unknown): string {
  if (typeof stored === 'boolean') return stored ? 'Bật' : 'Tắt';
  if (typeof stored === 'string') return field.kind === 'enum' ? enumOptionLabel(stored) : stored;
  if (typeof stored !== 'number') return '—';
  const suffix = fieldUnitSuffix(field);
  const text = toDisplay(field, stored).toLocaleString('vi-VN');
  return suffix ? `${text} ${suffix}` : text;
}

/** Gợi ý dưới ô: "Mặc định: x" (+ "Trần: y" với ô số). */
export function fieldHint(field: ConfigFieldMeta): string {
  return [
    `Mặc định: ${formatFieldValue(field, field.default)}`,
    isNumericField(field) && field.ceil !== undefined
      ? `Trần: ${formatFieldValue(field, field.ceil)}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Field số (int/bytes) — có sàn/trần và ô nhập số. */
export const isNumericField = (field: ConfigFieldMeta): boolean =>
  field.kind === 'int' || field.kind === 'bytes';

/**
 * Field form chung sửa được: số, bật/tắt, chọn trong danh sách. `json`/`string[]`
 * cần trình sửa riêng (vd `pm.defaultColumns`) nên bị bỏ qua ở đây.
 */
export const isEditableField = (field: ConfigFieldMeta): boolean =>
  isNumericField(field) ||
  field.kind === 'bool' ||
  (field.kind === 'enum' && (field.options?.length ?? 0) > 0);

/** Đọc giá trị theo path chấm (`appLock.enabled`) — cùng quy ước BE. */
export function readPath(obj: Record<string, unknown>, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (acc, seg) =>
        acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[seg] : undefined,
      obj,
    );
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Ghi giá trị theo path chấm, KHÔNG sửa `obj` (dựng các cấp lồng còn thiếu). */
export function setPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const [head, ...rest] = path.split('.');
  if (rest.length === 0) return { ...obj, [head]: value };
  const child = obj[head];
  return { ...obj, [head]: setPath(isRecord(child) ? child : {}, rest.join('.'), value) };
}

/** Bỏ giá trị theo path chấm, KHÔNG sửa `obj`; cấp cha thành rỗng thì bỏ luôn (giữ `stored` gọn). */
export function unsetPath(obj: Record<string, unknown>, path: string): Record<string, unknown> {
  const [head, ...rest] = path.split('.');
  if (!(head in obj)) return obj;
  const without = (o: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(o).filter(([k]) => k !== head));
  if (rest.length === 0) return without(obj);
  const child = obj[head];
  if (!isRecord(child)) return obj;
  const next = unsetPath(child, rest.join('.'));
  return Object.keys(next).length === 0 ? without(obj) : { ...obj, [head]: next };
}

/**
 * Tên ô trong form cho một `path` của BE. RHF hiểu dấu chấm là lồng nhau (`appLock.enabled` →
 * `{ appLock: { enabled } }`) còn form nhóm cấu hình giữ giá trị PHẲNG theo từng field, nên đổi
 * `.` thành `__`. Path phẳng (`maxChars`) không đổi.
 */
export const formKeyOf = (path: string): string => path.replaceAll('.', '__');
