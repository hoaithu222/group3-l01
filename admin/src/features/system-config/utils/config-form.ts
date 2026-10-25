import { z } from 'zod';

import type { ConfigFieldMeta, SystemConfigItem } from '../types/system-config.types';
import {
  formKeyOf,
  fromDisplay,
  isEditableField,
  isNumericField,
  readPath,
  setPath,
  toDisplay,
  unsetPath,
} from './config-fields';

/**
 * Giá trị form: `{ [formKeyOf(path)]: số hiển thị (byte quy MB) | bật/tắt | mã enum }` — phẳng
 * theo field; path lồng (`appLock.enabled`) thành khoá `appLock__enabled`.
 */
export type ConfigFormValue = number | boolean | string;
export type ConfigFormValues = Record<string, ConfigFormValue>;

/** Các field form chung sửa được của một khoá (bỏ `json`/`string[]`). */
export const editableFields = (item: SystemConfigItem): ConfigFieldMeta[] =>
  item.fields.filter(isEditableField);

/** Mặc định của field, ở dạng giá trị form. */
export function defaultFormValue(field: ConfigFieldMeta): ConfigFormValue {
  if (isNumericField(field)) return toDisplay(field, Number(field.default));
  if (field.kind === 'bool') return Boolean(field.default);
  return String(field.default);
}

/** Giá trị form từ giá trị hiệu lực của server. */
export function toFormValues(item: SystemConfigItem): ConfigFormValues {
  const values: ConfigFormValues = {};
  for (const field of editableFields(item)) {
    const raw = readPath(item.effective, field.path);
    const key = formKeyOf(field.path);
    if (isNumericField(field)) {
      values[key] = toDisplay(field, typeof raw === 'number' ? raw : Number(field.default));
    } else if (field.kind === 'bool') {
      values[key] = typeof raw === 'boolean' ? raw : Boolean(field.default);
    } else {
      values[key] = typeof raw === 'string' ? raw : String(field.default);
    }
  }
  return values;
}

/** Zod theo kind: số kẹp `floor`/`ceil` (đơn vị hiển thị), bật/tắt, enum theo `options`. */
export function buildFormSchema(fields: ConfigFieldMeta[]) {
  const shape: Record<string, z.ZodType<ConfigFormValue>> = {};
  for (const field of fields) {
    const key = formKeyOf(field.path);
    if (field.kind === 'bool') {
      shape[key] = z.boolean();
    } else if (field.kind === 'enum') {
      const options = field.options ?? [];
      shape[key] = z.string().refine((v) => options.includes(v), 'Giá trị không hợp lệ');
    } else {
      let num = z.number({ error: 'Nhập một số' });
      if (typeof field.floor === 'number') {
        const min = toDisplay(field, field.floor);
        num = num.min(min, `Tối thiểu ${min.toLocaleString('vi-VN')}`);
      }
      if (typeof field.ceil === 'number') {
        const max = toDisplay(field, field.ceil);
        num = num.max(max, `Tối đa ${max.toLocaleString('vi-VN')}`);
      }
      shape[key] = num;
    }
  }
  return z.object(shape);
}

/** Giá trị form → giá trị lưu (byte cho `bytes`; còn lại giữ nguyên). */
function toStored(field: ConfigFieldMeta, value: ConfigFormValue | undefined): unknown {
  if (isNumericField(field)) return fromDisplay(field, Number(value ?? 0));
  return value ?? defaultFormValue(field);
}

/**
 * Giá trị hiệu lực (đơn vị lưu) mà form đang biểu diễn — cho `ConfigDiffPreview`, cùng dạng
 * với `SystemConfigItem.effective` (path lồng thành object lồng, đọc lại bằng `readPath`).
 * Ô về đúng mặc định vẫn có mặt ở đây; chỉ `buildOverride` mới loại bỏ.
 */
export function formToEffective(
  fields: ConfigFieldMeta[],
  values: ConfigFormValues,
): Record<string, unknown> {
  let out: Record<string, unknown> = {};
  for (const field of fields) {
    out = setPath(out, field.path, toStored(field, values[formKeyOf(field.path)]));
  }
  return out;
}

/**
 * Phần override gửi `PUT`: mọi ô KHÁC mặc định, cùng dạng với `SystemConfigItem.stored` (path
 * lồng thành object lồng — BE lưu và kiểm schema theo dạng này). Ô về mặc định bị bỏ khỏi
 * `value` ("Về mặc định" = xoá khỏi override; cấp cha rỗng bị bỏ theo). Giữ nguyên các khoá lạ
 * đã lưu mà form không hiển thị (kể cả field `json` của khoá và nhánh anh em trong cấp lồng).
 */
export function buildOverride(
  item: SystemConfigItem,
  values: ConfigFormValues,
): Record<string, unknown> {
  const fields = editableFields(item);
  let value = item.stored;
  for (const field of fields) value = unsetPath(value, field.path);
  for (const field of fields) {
    const stored = toStored(field, values[formKeyOf(field.path)]);
    if (stored !== field.default) value = setPath(value, field.path, stored);
  }
  return value;
}
