/**
 * Hàm thuần của form `limits.*` (p0-07 admin.md §2.2): quy đổi đơn vị, zod theo
 * floor/ceil, và phần override gửi PUT.
 */
import { describe, expect, it } from 'vitest';

import type {
  ConfigFieldMeta,
  SystemConfigItem,
} from '@/features/system-config/types/system-config.types';
import {
  formatFieldValue,
  fromDisplay,
  toDisplay,
  unitSuffix,
} from '@/features/system-config/utils/config-fields';
import {
  buildFormSchema,
  buildOverride,
  toFormValues,
} from '@/features/system-config/utils/config-form';

const MB = 1024 * 1024;

const CHARS: ConfigFieldMeta = {
  path: 'maxChars',
  label: 'Số ký tự tối đa',
  kind: 'int',
  default: 4000,
  floor: 100,
  ceil: 4000,
  unit: 'count',
};
const BYTES: ConfigFieldMeta = {
  path: 'maxFileBytes',
  label: 'Kích thước tệp tối đa',
  kind: 'bytes',
  default: 25 * MB,
  floor: MB,
  ceil: 25 * MB,
  unit: 'bytes',
};

const item = (over: Partial<SystemConfigItem> = {}): SystemConfigItem => ({
  key: 'limits.x',
  tab: 'limits',
  label: 'X',
  fields: [CHARS, BYTES],
  stored: {},
  effective: { maxChars: 4000, maxFileBytes: 25 * MB },
  version: 1,
  updatedAt: null,
  updatedBy: null,
  ...over,
});

describe('quy đổi đơn vị', () => {
  it('bytes hiển thị MB và gửi lại byte; field khác giữ nguyên', () => {
    expect(toDisplay(BYTES, 25 * MB)).toBe(25);
    expect(fromDisplay(BYTES, 12.5)).toBe(12.5 * MB);
    expect(toDisplay(CHARS, 4000)).toBe(4000);
    expect(fromDisplay(CHARS, 4000)).toBe(4000);
  });

  it('hậu tố theo đơn vị BE khai (phút/ngày không bị hiện thành "giây")', () => {
    expect(unitSuffix('s')).toBe('giây');
    expect(unitSuffix('min')).toBe('phút');
    expect(unitSuffix('days')).toBe('ngày');
    expect(unitSuffix('count')).toBe('');
    expect(unitSuffix(undefined)).toBe('');
    expect(formatFieldValue(BYTES, 25 * MB)).toBe('25 MB');
  });
});

describe('buildFormSchema', () => {
  const schema = buildFormSchema([CHARS, BYTES]);

  it('trong khoảng [floor, ceil] → hợp lệ', () => {
    expect(schema.safeParse({ maxChars: 2000, maxFileBytes: 10 }).success).toBe(true);
  });

  it('vượt trần / dưới sàn → báo lỗi đúng ô, số theo đơn vị hiển thị', () => {
    const over = schema.safeParse({ maxChars: 9999, maxFileBytes: 10 });
    expect(over.success).toBe(false);
    expect(over.error?.issues[0]).toMatchObject({ path: ['maxChars'] });
    expect(over.error?.issues[0]?.message).toContain('Tối đa');

    const under = schema.safeParse({ maxChars: 2000, maxFileBytes: 0.1 });
    expect(under.error?.issues[0]).toMatchObject({ path: ['maxFileBytes'] });
    expect(under.error?.issues[0]?.message).toBe('Tối thiểu 1');
  });
});

describe('toFormValues / buildOverride', () => {
  it('form lấy giá trị hiệu lực (byte quy MB)', () => {
    expect(toFormValues(item({ effective: { maxChars: 2000, maxFileBytes: 5 * MB } }))).toEqual({
      maxChars: 2000,
      maxFileBytes: 5,
    });
  });

  it('chỉ ô khác mặc định vào override; ô về mặc định bị bỏ', () => {
    expect(buildOverride(item(), { maxChars: 2000, maxFileBytes: 25 })).toEqual({ maxChars: 2000 });
    expect(buildOverride(item(), { maxChars: 4000, maxFileBytes: 10 })).toEqual({
      maxFileBytes: 10 * MB,
    });
    expect(
      buildOverride(item({ stored: { maxChars: 2000 } }), { maxChars: 4000, maxFileBytes: 25 }),
    ).toEqual({});
  });

  it('giữ nguyên khoá lạ đã lưu mà tab không hiển thị', () => {
    expect(
      buildOverride(item({ stored: { legacyFlag: true } }), { maxChars: 2000, maxFileBytes: 25 }),
    ).toEqual({ legacyFlag: true, maxChars: 2000 });
  });
});

describe('field bật/tắt và chọn (enum)', () => {
  const BOOL: ConfigFieldMeta = {
    path: 'enabledByDefault',
    label: 'Bật mời khách mặc định',
    kind: 'bool',
    default: false,
  };
  const ENUM: ConfigFieldMeta = {
    path: 'directMode',
    label: 'Tin nhắn 1-1',
    kind: 'enum',
    default: 'MENTIONS_AND_THREADS',
    options: ['ALL', 'MENTIONS_AND_THREADS', 'MUTED'],
  };
  const JSON_FIELD: ConfigFieldMeta = {
    path: 'defaultColumns',
    label: 'Cột',
    kind: 'json',
    default: [],
  };

  const mixed = (over: Partial<SystemConfigItem> = {}): SystemConfigItem =>
    item({
      fields: [BOOL, ENUM, JSON_FIELD],
      effective: {
        enabledByDefault: false,
        directMode: 'MENTIONS_AND_THREADS',
        defaultColumns: [],
      },
      ...over,
    });

  it('form chỉ gồm field sửa được — field json bị bỏ qua', () => {
    expect(toFormValues(mixed())).toEqual({
      enabledByDefault: false,
      directMode: 'MENTIONS_AND_THREADS',
    });
  });

  it('nhãn tiếng Việt cho giá trị enum/bool; mã lạ hiện nguyên mã', () => {
    expect(formatFieldValue(ENUM, 'MUTED')).toBe('Tắt thông báo');
    expect(formatFieldValue(ENUM, 'MOI_LA')).toBe('MOI_LA');
    expect(formatFieldValue(BOOL, true)).toBe('Bật');
    expect(formatFieldValue(BOOL, false)).toBe('Tắt');
  });

  it('zod: enum chỉ nhận giá trị trong options, bool phải là boolean', () => {
    const schema = buildFormSchema([BOOL, ENUM]);
    expect(schema.safeParse({ enabledByDefault: true, directMode: 'ALL' }).success).toBe(true);
    expect(schema.safeParse({ enabledByDefault: true, directMode: 'KHONG_CO' }).success).toBe(
      false,
    );
    expect(schema.safeParse({ enabledByDefault: 'true', directMode: 'ALL' }).success).toBe(false);
  });

  it('override: chỉ ô khác mặc định; giữ nguyên field json đã lưu', () => {
    const it2 = mixed({ stored: { defaultColumns: [{ title: 'Xong', kind: 'DONE' }] } });
    expect(
      buildOverride(it2, { enabledByDefault: true, directMode: 'MENTIONS_AND_THREADS' }),
    ).toEqual({
      defaultColumns: [{ title: 'Xong', kind: 'DONE' }],
      enabledByDefault: true,
    });
    expect(buildOverride(it2, { enabledByDefault: false, directMode: 'MUTED' })).toEqual({
      defaultColumns: [{ title: 'Xong', kind: 'DONE' }],
      directMode: 'MUTED',
    });
  });
});
