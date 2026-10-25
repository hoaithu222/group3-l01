/**
 * p6-07: `appConfig.portfolioBaseUrl` — gốc link portfolio công khai. Có `EXPO_PUBLIC_PORTFOLIO_BASE_URL` thì dùng (bỏ `/` cuối); trống thì SUY từ `EXPO_PUBLIC_API_BASE_URL` (bỏ `/api/v1`, thêm `/p`) — cùng cách
 * `socketUrl`, vì `/p/*` do CÙNG máy chủ BE phục vụ, ngoài `/api`. Nạp lại module trong `isolateModules` để `RAW` đọc `process.env` mới.
 */
const KEYS = ['EXPO_PUBLIC_API_BASE_URL', 'EXPO_PUBLIC_PORTFOLIO_BASE_URL'] as const;
// `types/env.d.ts` khai các biến `EXPO_PUBLIC_*` là `readonly` (app không được ghi); test thì phải ghi để dựng từng cấu hình.
const processEnv = process.env as Record<string, string | undefined>;

function portfolioBaseUrlWith(values: Partial<Record<(typeof KEYS)[number], string>>): string {
  const saved = KEYS.map((key) => [key, processEnv[key]] as const);
  KEYS.forEach((key) => {
    const wanted = values[key];
    if (wanted === undefined) delete processEnv[key];
    else processEnv[key] = wanted;
  });
  try {
    let value = '';
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      value = (require('@/core/config/env.config') as { appConfig: { portfolioBaseUrl: string } })
        .appConfig.portfolioBaseUrl;
    });
    return value;
  } finally {
    saved.forEach(([key, original]) => {
      if (original === undefined) delete processEnv[key];
      else processEnv[key] = original;
    });
  }
}

describe('appConfig.portfolioBaseUrl', () => {
  it('khai tường minh ⇒ dùng đúng giá trị đó, bỏ mọi dấu / cuối và khoảng trắng', () => {
    expect(
      portfolioBaseUrlWith({
        EXPO_PUBLIC_API_BASE_URL: 'http://10.0.2.2:3000/api/v1',
        EXPO_PUBLIC_PORTFOLIO_BASE_URL: ' https://superapp.vcijsc.com/p/// ',
      }),
    ).toBe('https://superapp.vcijsc.com/p');
  });

  it('để trống ⇒ suy từ API_BASE_URL: bỏ /api/v1 (kể cả có / cuối), thêm /p', () => {
    expect(portfolioBaseUrlWith({ EXPO_PUBLIC_API_BASE_URL: 'http://10.0.2.2:3000/api/v1' })).toBe(
      'http://10.0.2.2:3000/p',
    );
    expect(
      portfolioBaseUrlWith({ EXPO_PUBLIC_API_BASE_URL: 'https://api.vcijsc.com/api/v1/' }),
    ).toBe('https://api.vcijsc.com/p');
  });

  it('không có cả hai ⇒ "/p" (không ném; chỉ dùng để hiển thị đường dẫn dự kiến)', () => {
    expect(portfolioBaseUrlWith({})).toBe('/p');
  });
});
