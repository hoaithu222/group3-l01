import fs from 'node:fs';
import path from 'node:path';

import type buildConfig from '../../app.config';

/**
 * Nơi LẮP RÁP các feature vào cây route — lỗi ở đây "im lặng" (tsc/eslint xanh, tính năng chỉ không xuất hiện), nên khoá bằng đọc thẳng file:
 *
 *  · p6-06: `career/register-profile` PHẢI được import ở `me/_layout.tsx` — nó chỉ có tác dụng phụ (đăng ký hàng "Nghề nghiệp"); không ai import
 *    thì hàng không hiện. `SkillUnlockedHost` mount ĐÚNG MỘT LẦN ở `(app)/_layout.tsx` — hai bản cùng nghe `skill:unlocked` thì bản nào nhận
 *    trước "ăn" cờ đã-xem, tấm chúc mừng hiện hay không tuỳ thứ tự vẽ.
 *  · p6-03: `/mentor/{postId}` mở được ở cấp app link (`pathPrefix`), và KHÔNG có file route thứ hai cùng URL ngoài nhóm `(app)` (trùng route).
 */
const ROOT = path.join(__dirname, '..', '..');
const read = (...segments: string[]): string =>
  fs.readFileSync(path.join(ROOT, ...segments), 'utf8');

/** Bỏ chú thích để `<SkillUnlockedHost />` nhắc TRONG chú thích không bị đếm nhầm. */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('p6-06 — nghề nghiệp', () => {
  it('me/_layout.tsx import register-profile của career (hàng "Nghề nghiệp" ở màn Tôi)', () => {
    expect(stripComments(read('app', '(app)', 'me', '_layout.tsx'))).toContain(
      "import '@/features/career/register-profile';",
    );
  });

  it('SkillUnlockedHost mount đúng MỘT lần, ở (app)/_layout.tsx — không còn ở màn Nghề nghiệp', () => {
    const layout = stripComments(read('app', '(app)', '_layout.tsx'));
    expect(layout.match(/<SkillUnlockedHost\s*\/>/g)).toHaveLength(1);

    const careerHome = stripComments(
      read('src', 'features', 'career', 'screens', 'CareerHomeScreen.tsx'),
    );
    expect(careerHome).not.toContain('SkillUnlockedHost');
  });
});

describe('p6-03 — deep link /mentor/{postId}', () => {
  it('app.config.ts khai pathPrefix "/mentor/" (dấu / cuối — không nuốt /mentors…) cho app link https', () => {
    // `require` chứ không `import()`: Jest không bật `--experimental-vm-modules`. File chỉ đọc `process.env` lúc dựng cấu hình.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { default: makeConfig } = require('../../app.config') as { default: typeof buildConfig };
    const config = makeConfig({ config: {} } as never);
    // `data` của một intent filter có thể là MỘT đối tượng hoặc mảng — `[x].flat()` chuẩn hoá cả hai.
    const prefixes = (config.android?.intentFilters ?? []).flatMap((filter) =>
      [filter.data ?? []].flat().map((item) => item.pathPrefix),
    );

    expect(prefixes).toContain('/mentor/');
    expect(prefixes).not.toContain('/mentor');
  });

  it('route đích duy nhất là (app)/mentor/[postId].tsx; không có app/mentor/ ngoài nhóm (sẽ trùng URL)', () => {
    expect(fs.existsSync(path.join(ROOT, 'app', '(app)', 'mentor', '[postId].tsx'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'app', 'mentor'))).toBe(false);
  });
});
