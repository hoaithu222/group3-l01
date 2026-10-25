import fs from 'node:fs';
import path from 'node:path';

import { measureFontFamily } from '../../scripts/lib/font-metrics.mjs';
import { DARK_COLORS, LIGHT_COLORS, THEME_COLOR_KEYS } from '@/shared/theme/colors.generated';
import {
  TEXT_STYLES,
  TYPOGRAPHY_ROLES,
  UPPERCASE_ROLES,
} from '@/shared/theme/typography.generated';

const ROOT = path.join(__dirname, '..', '..');

describe('Token màu', () => {
  it('light và dark có ĐÚNG cùng bộ khoá', () => {
    expect(Object.keys(LIGHT_COLORS).sort()).toEqual(Object.keys(DARK_COLORS).sort());
  });

  it('mọi giá trị là #RRGGBB — prop màu thô của React Native không nhận dạng khác', () => {
    for (const key of THEME_COLOR_KEYS) {
      expect(LIGHT_COLORS[key]).toMatch(/^#[0-9A-F]{6}$/);
      expect(DARK_COLORS[key]).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  /**
   * File sinh ra phải khớp với file nguồn. Test này bắt ca ai đó sửa
   * `colors.json` rồi quên chạy `npm run generate:colors` — lúc đó
   * `tailwind.config.js` và code TypeScript đọc hai bảng màu KHÁC NHAU, và
   * triệu chứng là màu nền không khớp màu icon ở đúng vài chỗ.
   */
  it('khớp số lượng token với colors.json (nhớ chạy generate:colors)', () => {
    const source = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'src/styles/colors/colors.json'), 'utf8'),
    ) as { light: Record<string, string> };
    expect(THEME_COLOR_KEYS).toHaveLength(Object.keys(source.light).length);
  });
});

describe('Thang chữ', () => {
  /**
   * ⛔ Luật quan trọng nhất của hệ chữ — và nó được ĐO, không phải ước lượng.
   *
   * Tiếng Việt xếp dấu chồng hai tầng (`Ẳ` = A + dấu á + dấu hỏi). Khi lineHeight
   * quá sát fontSize, Android CẮT CỤT phần dấu phía trên; iOS thì cho tràn nên
   * lỗi CHỈ hiện trên Android — rất dễ lọt qua khâu review làm trên máy Mac.
   *
   * Ngưỡng lấy từ chính file font (xem `scripts/lib/font-metrics.mjs`), nên đổi
   * font là ngưỡng tự đổi theo. `generate-typography.mjs` đã kiểm lúc sinh; test này
   * kiểm LẠI ở CI để bắt ca ai đó sửa tay file `*.generated.*`.
   */
  const fontDir = path.join(ROOT, 'assets/fonts');
  const fontFiles = fs
    .readdirSync(fontDir)
    .filter((name) => name.toLowerCase().endsWith('.ttf'))
    .map((name) => path.join(fontDir, name));

  const metrics = measureFontFamily(fontFiles);
  const minRatioUppercase = metrics ? Math.ceil(metrics.vietnameseRatio * 100) / 100 : 1.47;
  const MIN_RATIO_MIXED_CASE = 1.3;

  it('đo được font — không đo được thì luật thành số ước lượng', () => {
    expect(metrics).not.toBeNull();
    // Chữ Việt cần hơn 40% chiều cao so với chỉ Latin. Đây là lý do TỒN TẠI
    // của cả luật này; số cụ thể thay đổi theo font nên chỉ kiểm khoảng.
    expect(metrics!.vietnameseRatio).toBeGreaterThan(metrics!.asciiRatio * 1.2);
  });

  it.each(TYPOGRAPHY_ROLES)('vai trò "%s" có lineHeight đủ cho dấu tiếng Việt', (role) => {
    const style = TEXT_STYLES[role];
    const required = (UPPERCASE_ROLES as readonly string[]).includes(role)
      ? minRatioUppercase
      : MIN_RATIO_MIXED_CASE;

    expect(style.fontSize).toBeGreaterThan(0);
    expect(style.lineHeight! / style.fontSize!).toBeGreaterThanOrEqual(required);
  });

  it('vai trò IN HOA được khai textTransform, không phải viết hoa bằng tay', () => {
    for (const role of UPPERCASE_ROLES) {
      expect(TEXT_STYLES[role].textTransform).toBe('uppercase');
    }
  });

  it('khớp với typography.json (nhớ chạy generate:typography)', () => {
    const source = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'src/styles/typography/typography.json'), 'utf8'),
    ) as { roles: Record<string, { size: number; lineHeight: number }> };

    expect([...TYPOGRAPHY_ROLES].sort()).toEqual(Object.keys(source.roles).sort());
    for (const [name, role] of Object.entries(source.roles)) {
      expect(TEXT_STYLES[name as (typeof TYPOGRAPHY_ROLES)[number]]).toMatchObject({
        fontSize: role.size,
        lineHeight: role.lineHeight,
      });
    }
  });
});
