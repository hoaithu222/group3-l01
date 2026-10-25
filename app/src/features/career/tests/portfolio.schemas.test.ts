import { FALLBACK_PORTFOLIO_LIMITS } from '../constants/portfolio.constants';
import { readPortfolioLimits } from '../hooks/usePortfolioLimits';
import {
  projectDefaults,
  projectSchema,
  toUpdateInput,
} from '../schemas/portfolio-project.schemas';
import { profileDefaults, profileSchema, toSaveInput } from '../schemas/portfolio.schemas';
import { DEFAULT_SECTIONS } from '../utils/portfolio-sections';
import { makePortfolio, makeProject } from './portfolio.fixtures';

/**
 * app.md p6-07 §8 "Contract": payload `PUT /me/portfolio` và `PATCH …/projects/:id` KHÔNG chứa trường lạ (BE `.strict()`), `expectedVersion` luôn có; giới hạn đếm GRAPHEME như BE;
 * liên kết chỉ `https://` không tài khoản (CR-33).
 */
const LIMITS = readPortfolioLimits(undefined);
const REST = {
  sections: [...DEFAULT_SECTIONS],
  seoIndexable: false,
  theme: { accent: 'GREEN', template: 'CLASSIC' } as const,
};

describe('thân PUT /me/portfolio', () => {
  it('đúng bộ khoá BE `.strict()` chấp nhận, `expectedVersion` là số, chuỗi rỗng ⇒ null', () => {
    const values = { ...profileDefaults(makePortfolio(), ''), bio: '', headline: '' };
    const body = toSaveInput(values, REST, 7);
    expect(Object.keys(body).sort()).toEqual([
      'avatarAssetId',
      'bio',
      'displayName',
      'expectedVersion',
      'headline',
      'links',
      'sections',
      'seoIndexable',
      'theme',
    ]);
    expect(body).toMatchObject({ bio: null, expectedVersion: 7, headline: null });
    expect(Object.keys(body.links[0]!).sort()).toEqual(['label', 'url']);
  });

  it('tạo lần đầu (chưa có hồ sơ): tên lấy từ tài khoản, `expectedVersion: 0`', () => {
    const values = profileDefaults(null, 'Trần Thị Bình');
    expect(values.displayName).toBe('Trần Thị Bình');
    expect(toSaveInput(values, REST, 0).expectedVersion).toBe(0);
  });
});

describe('profileSchema', () => {
  const parse = (over: object) =>
    profileSchema(LIMITS).safeParse({ ...profileDefaults(makePortfolio(), ''), ...over });

  it('liên kết: chỉ https:// không tài khoản; javascript:/data:/http: bị chặn', () => {
    const ok = (url: string) => parse({ links: [{ label: 'X', url }] }).success;
    expect([
      ok('https://github.com/an'),
      ok('http://x.com'),
      ok('javascript:alert(1)'),
      ok('data:text/html,x'),
      ok('https://tin-cay.com@doc-hai.com'),
      ok('https://'),
    ]).toEqual([true, false, false, false, false, false]);
  });

  it('tên 2–60 ký tự; quá số liên kết tối đa bị chặn', () => {
    expect(parse({ displayName: 'A' }).success).toBe(false);
    expect(parse({ displayName: 'x'.repeat(61) }).success).toBe(false);
    const links = Array.from({ length: LIMITS.linksMax + 1 }, () => ({
      label: 'L',
      url: 'https://a.com',
    }));
    expect(parse({ links }).success).toBe(false);
  });

  it('giới thiệu đếm GRAPHEME: emoji ghép là MỘT ký tự (không chặn oan)', () => {
    const family = '👨‍👩‍👧';
    expect(parse({ bio: family.repeat(LIMITS.bioMax) }).success).toBe(true);
    expect(parse({ bio: 'a'.repeat(LIMITS.bioMax + 1) }).success).toBe(false);
  });
});

describe('thân PATCH /me/portfolio/projects/:id', () => {
  const values = projectDefaults(
    makeProject({ highlights: ['Làm đăng nhập'], summary: '', version: 4 }),
  );

  it('đúng bộ khoá BE `.strict()`, `expectedVersion` của DỰ ÁN, điểm nổi bật là mảng chuỗi', () => {
    const body = toUpdateInput(values, 4);
    expect(Object.keys(body).sort()).toEqual([
      'coverAssetId',
      'expectedVersion',
      'highlights',
      'periodFrom',
      'periodTo',
      'role',
      'showTeammates',
      'summary',
      'title',
      'visible',
    ]);
    expect(body).toMatchObject({
      expectedVersion: 4,
      highlights: ['Làm đăng nhập'],
      role: null,
      summary: null,
    });
  });

  it('bắt đầu sau kết thúc ⇒ lỗi gắn vào ô kết thúc; tối đa 3 điểm nổi bật', () => {
    const schema = projectSchema(LIMITS);
    const bad = schema.safeParse({
      ...values,
      periodFrom: '2026-09-01T00:00:00+07:00',
      periodTo: '2026-03-01T00:00:00+07:00',
    });
    expect(bad.success ? [] : bad.error.issues.map((issue) => issue.path.join('.'))).toEqual([
      'periodTo',
    ]);
    // Hai dạng ISO (server `…Z` và vừa chọn `…+07:00`) vẫn so đúng THỜI ĐIỂM.
    expect(
      schema.safeParse({
        ...values,
        periodFrom: '2026-08-31T17:00:00.000Z',
        periodTo: '2026-09-01T00:00:00+07:00',
      }).success,
    ).toBe(true);
    const many = Array.from({ length: LIMITS.highlightsMax + 1 }, () => ({ text: 'Ý' }));
    expect(schema.safeParse({ ...values, highlights: many }).success).toBe(false);
  });
});

describe('readPortfolioLimits', () => {
  it('thiếu nhóm/khoá hoặc không phải số dương ⇒ dùng trần cứng của BE; số hợp lệ được nhận', () => {
    expect(readPortfolioLimits(undefined)).toEqual(FALLBACK_PORTFOLIO_LIMITS);
    const read = readPortfolioLimits({
      portfolio: { bioMax: 400, linksMax: 'nhiều', projectsMax: -1, slugMax: 0 },
    });
    expect(read).toMatchObject({ bioMax: 400, linksMax: 6, projectsMax: 12, slugMax: 30 });
  });
});
