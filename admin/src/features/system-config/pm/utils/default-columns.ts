import { COLUMN_KIND_LABELS, COLUMN_KINDS, type ColumnKind } from '@/shared/constants/column-kinds';

import type { SystemConfigItem } from '../../types/system-config.types';
import { readPath } from '../../utils/config-fields';
import { COLUMNS_MAX, COLUMNS_MIN } from '../constants/pm.constants';
import type { DefaultColumnRow, DefaultColumnsFormValues } from '../schemas/default-columns.schema';

/** Đường dẫn field json trong `value` của khoá `pm`. */
const COLUMNS_PATH = 'defaultColumns';

const isColumnKind = (v: unknown): v is ColumnKind => (COLUMN_KINDS as readonly unknown[]).includes(v);

/** Đọc mảng cột từ giá trị server; phần tử hỏng bị bỏ qua thay vì làm vỡ form. */
export function readColumns(raw: unknown): DefaultColumnRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((c): DefaultColumnRow[] => {
    if (!c || typeof c !== 'object') return [];
    const o = c as Record<string, unknown>;
    if (typeof o.title !== 'string' || !isColumnKind(o.kind)) return [];
    return [
      typeof o.wipLimit === 'number'
        ? { title: o.title, kind: o.kind, wipLimit: o.wipLimit }
        : { title: o.title, kind: o.kind },
    ];
  });
}

/** Giá trị form từ giá trị HIỆU LỰC của server; thiếu/hỏng → mặc định khai trong registry. */
export function toColumnsForm(item: SystemConfigItem): DefaultColumnsFormValues {
  const effective = readColumns(readPath(item.effective, COLUMNS_PATH));
  if (effective.length > 0) return { columns: effective };
  const field = item.fields.find((f) => f.path === COLUMNS_PATH);
  return { columns: readColumns(field?.default) };
}

/** Phần `value` gửi PUT: chỉ field json `defaultColumns` (khoá lạ đã lưu do hook giữ nguyên). */
export function columnsPatch(values: DefaultColumnsFormValues): Record<string, unknown> {
  return {
    [COLUMNS_PATH]: values.columns.map((c) => ({
      title: c.title,
      kind: c.kind,
      ...(typeof c.wipLimit === 'number' ? { wipLimit: c.wipLimit } : {}),
    })),
  };
}

/** "To do · Cần làm → In progress · Đang làm → …" — một dòng để so trước/sau trong hộp thoại xác nhận. */
export const summarizeColumns = (cols: readonly DefaultColumnRow[]): string =>
  cols.map((c) => `${c.title || '(chưa đặt tên)'} · ${COLUMN_KIND_LABELS[c.kind]}`).join(' → ');

/**
 * Số cột tối đa của mẫu = trần hiện hành `limits.board.columnsMax` (2–12), rơi về 12 khi chưa biết —
 * mẫu vượt trần đó thì BE cũng không cho tạo bảng đủ cột.
 */
export function maxColumnsOf(boardLimits: SystemConfigItem | undefined): number {
  const raw = boardLimits ? readPath(boardLimits.effective, 'columnsMax') : undefined;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return COLUMNS_MAX;
  return Math.min(COLUMNS_MAX, Math.max(COLUMNS_MIN, Math.trunc(raw)));
}
