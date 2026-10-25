/**
 * Đơn vị hiển thị của field `bytes` sau p3-01: trần ≥ 1 GiB (hạn mức kho tài liệu 0,5–100 GiB) đọc bằng GiB,
 * còn lại giữ MB như p0-07 (các bài kiểm cũ ở `config-form.test.ts` không đổi).
 */
import { describe, expect, it } from 'vitest';

import type {
  ConfigFieldMeta,
  SystemConfigItem,
} from '@/features/system-config/types/system-config.types';
import {
  fieldUnitSuffix,
  formatFieldValue,
  fromDisplay,
  toDisplay,
} from '@/features/system-config/utils/config-fields';
import { buildFormSchema, buildOverride, toFormValues } from '@/features/system-config/utils/config-form';

const MB = 1024 * 1024;
const GIB = 1024 * MB;

const QUOTA: ConfigFieldMeta = {
  path: 'workspaceQuotaBytes',
  label: 'Hạn mức mặc định / nhóm',
  kind: 'bytes',
  default: 2 * GIB,
  floor: GIB / 2,
  ceil: 100 * GIB,
  unit: 'bytes',
};
const UPLOAD: ConfigFieldMeta = {
  path: 'maxFileBytes',
  label: 'Kích thước tệp tối đa',
  kind: 'bytes',
  default: 25 * MB,
  floor: MB,
  ceil: 25 * MB,
  unit: 'bytes',
};

const item = (): SystemConfigItem => ({
  key: 'limits.resource',
  tab: 'storage',
  label: 'Kho tài liệu',
  fields: [QUOTA],
  stored: {},
  effective: { workspaceQuotaBytes: 2 * GIB },
  version: 1,
  updatedAt: null,
  updatedBy: null,
});

describe('field bytes có trần ≥ 1 GiB', () => {
  it('quy đổi GiB ⇄ byte (0,5 GiB được), hậu tố "GiB"', () => {
    expect(toDisplay(QUOTA, 2 * GIB)).toBe(2);
    expect(toDisplay(QUOTA, GIB / 2)).toBe(0.5);
    expect(toDisplay(QUOTA, 100 * GIB)).toBe(100);
    expect(fromDisplay(QUOTA, 0.5)).toBe(GIB / 2);
    expect(fromDisplay(QUOTA, 3)).toBe(3 * GIB);
    expect(fieldUnitSuffix(QUOTA)).toBe('GiB');
    expect(formatFieldValue(QUOTA, 2 * GIB)).toBe('2 GiB');
    expect(formatFieldValue(QUOTA, 100 * GIB)).toBe('100 GiB');
  });

  it('field bytes trần nhỏ vẫn MB (không đổi so với p0-07)', () => {
    expect(toDisplay(UPLOAD, 25 * MB)).toBe(25);
    expect(fromDisplay(UPLOAD, 12.5)).toBe(12.5 * MB);
    expect(fieldUnitSuffix(UPLOAD)).toBe('MB');
    expect(formatFieldValue(UPLOAD, 25 * MB)).toBe('25 MB');
  });

  it('field int giữ hậu tố theo `unit` như cũ', () => {
    const days: ConfigFieldMeta = { path: 'd', label: 'd', kind: 'int', default: 30, unit: 'days' };
    expect(fieldUnitSuffix(days)).toBe('ngày');
    expect(fieldUnitSuffix({ ...days, unit: undefined })).toBe('');
  });

  it('zod kẹp 0,5–100 GiB theo đơn vị hiển thị', () => {
    const schema = buildFormSchema([QUOTA]);
    expect(schema.safeParse({ workspaceQuotaBytes: 0.5 }).success).toBe(true);
    expect(schema.safeParse({ workspaceQuotaBytes: 100 }).success).toBe(true);
    const low = schema.safeParse({ workspaceQuotaBytes: 0.25 });
    expect(low.success).toBe(false);
    expect(low.error?.issues[0]?.message).toBe('Tối thiểu 0,5');
    expect(schema.safeParse({ workspaceQuotaBytes: 101 }).success).toBe(false);
  });

  it('override: đúng mặc định → không gửi; khác mặc định → gửi byte', () => {
    expect(buildOverride(item(), toFormValues(item()))).toEqual({});
    expect(buildOverride(item(), { workspaceQuotaBytes: 3 })).toEqual({ workspaceQuotaBytes: 3 * GIB });
  });
});
