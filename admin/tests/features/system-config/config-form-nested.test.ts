/**
 * `config-form` với field path LỒNG (khoá registry `auth`: `biometricLogin.enabled`,
 * `appLock.enabled`, `appLock.lockAfterBackgroundSeconds`) — p0-07 admin.md, tab `auth`.
 * Form giữ khoá phẳng (`appLock__enabled`); `stored`/`PUT` giữ object lồng như BE.
 */
import { describe, expect, it } from 'vitest';

import type {
  ConfigFieldMeta,
  SystemConfigItem,
} from '@/features/system-config/types/system-config.types';
import {
  formKeyOf,
  readPath,
  setPath,
  unsetPath,
} from '@/features/system-config/utils/config-fields';
import {
  buildFormSchema,
  buildOverride,
  formToEffective,
  toFormValues,
} from '@/features/system-config/utils/config-form';

const BIO: ConfigFieldMeta = {
  path: 'biometricLogin.enabled',
  label: 'Đăng nhập sinh trắc học',
  kind: 'bool',
  default: true,
};
const LOCK: ConfigFieldMeta = {
  path: 'appLock.enabled',
  label: 'Khoá ứng dụng',
  kind: 'bool',
  default: true,
};
const SECONDS: ConfigFieldMeta = {
  path: 'appLock.lockAfterBackgroundSeconds',
  label: 'Khoá sau khi chạy nền (giây)',
  kind: 'int',
  default: 300,
  floor: 60,
  ceil: 3600,
  unit: 's',
};

const auth = (over: Partial<SystemConfigItem> = {}): SystemConfigItem => ({
  key: 'auth',
  tab: 'auth',
  label: 'Xác thực',
  fields: [BIO, LOCK, SECONDS],
  stored: {},
  effective: {
    biometricLogin: { enabled: true },
    appLock: { enabled: true, lockAfterBackgroundSeconds: 300 },
  },
  version: 2,
  updatedAt: null,
  updatedBy: null,
  ...over,
});

const FORM_DEFAULTS = {
  biometricLogin__enabled: true,
  appLock__enabled: true,
  appLock__lockAfterBackgroundSeconds: 300,
};

describe('path lồng: readPath / setPath / unsetPath / formKeyOf', () => {
  it('formKeyOf đổi dấu chấm thành gạch dưới kép; path phẳng giữ nguyên', () => {
    expect(formKeyOf('appLock.enabled')).toBe('appLock__enabled');
    expect(formKeyOf('providers.github.enabled')).toBe('providers__github__enabled');
    expect(formKeyOf('maxChars')).toBe('maxChars');
  });

  it('setPath dựng cấp lồng còn thiếu và KHÔNG sửa object gốc', () => {
    const base = { appLock: { enabled: false } };
    const next = setPath(base, 'appLock.lockAfterBackgroundSeconds', 120);
    expect(next).toEqual({ appLock: { enabled: false, lockAfterBackgroundSeconds: 120 } });
    expect(base).toEqual({ appLock: { enabled: false } });
    expect(readPath(setPath({}, 'a.b.c', 1), 'a.b.c')).toBe(1);
  });

  it('unsetPath bỏ đúng nhánh, bỏ luôn cấp cha rỗng, giữ nhánh anh em', () => {
    expect(unsetPath({ appLock: { enabled: false } }, 'appLock.enabled')).toEqual({});
    expect(
      unsetPath({ appLock: { enabled: false, lockAfterBackgroundSeconds: 90 } }, 'appLock.enabled'),
    ).toEqual({ appLock: { lockAfterBackgroundSeconds: 90 } });
    expect(unsetPath({ x: 1 }, 'appLock.enabled')).toEqual({ x: 1 });
  });
});

describe('form nhóm `auth` (path lồng)', () => {
  it('toFormValues đọc giá trị hiệu lực lồng thành khoá phẳng', () => {
    expect(toFormValues(auth())).toEqual(FORM_DEFAULTS);
    expect(
      toFormValues(
        auth({
          effective: {
            biometricLogin: { enabled: false },
            appLock: { enabled: true, lockAfterBackgroundSeconds: 120 },
          },
        }),
      ),
    ).toEqual({
      biometricLogin__enabled: false,
      appLock__enabled: true,
      appLock__lockAfterBackgroundSeconds: 120,
    });
  });

  it('zod theo khoá phẳng: kẹp floor/ceil đúng ô lồng', () => {
    const schema = buildFormSchema([BIO, LOCK, SECONDS]);
    expect(schema.safeParse(FORM_DEFAULTS).success).toBe(true);
    const low = schema.safeParse({ ...FORM_DEFAULTS, appLock__lockAfterBackgroundSeconds: 10 });
    expect(low.error?.issues[0]).toMatchObject({ path: ['appLock__lockAfterBackgroundSeconds'] });
    expect(low.error?.issues[0]?.message).toBe('Tối thiểu 60');
    expect(
      schema.safeParse({ ...FORM_DEFAULTS, appLock__enabled: 'yes' }).success,
    ).toBe(false);
  });

  it('override gửi object LỒNG, chỉ ô khác mặc định', () => {
    expect(buildOverride(auth(), { ...FORM_DEFAULTS, appLock__enabled: false })).toEqual({
      appLock: { enabled: false },
    });
    expect(
      buildOverride(auth(), {
        biometricLogin__enabled: false,
        appLock__enabled: true,
        appLock__lockAfterBackgroundSeconds: 600,
      }),
    ).toEqual({
      biometricLogin: { enabled: false },
      appLock: { lockAfterBackgroundSeconds: 600 },
    });
    // Không sửa gì → override rỗng (không có cấp cha rỗng `appLock: {}`).
    expect(buildOverride(auth(), FORM_DEFAULTS)).toEqual({});
  });

  it('ô về mặc định bị bỏ khỏi override đã lưu; nhánh anh em và khoá lạ được giữ', () => {
    const stored = { appLock: { enabled: false, lockAfterBackgroundSeconds: 900 }, legacy: 1 };
    expect(buildOverride(auth({ stored }), { ...FORM_DEFAULTS, appLock__lockAfterBackgroundSeconds: 900 })).toEqual({
      appLock: { lockAfterBackgroundSeconds: 900 },
      legacy: 1,
    });
    expect(
      buildOverride(auth({ stored: { appLock: { enabled: false } } }), FORM_DEFAULTS),
    ).toEqual({});
  });

  it('formToEffective dựng object lồng để ConfigDiffPreview đọc lại bằng readPath', () => {
    const effective = formToEffective([BIO, LOCK, SECONDS], {
      ...FORM_DEFAULTS,
      appLock__lockAfterBackgroundSeconds: 600,
    });
    expect(effective).toEqual({
      biometricLogin: { enabled: true },
      appLock: { enabled: true, lockAfterBackgroundSeconds: 600 },
    });
    expect(readPath(effective, SECONDS.path)).toBe(600);
  });
});
