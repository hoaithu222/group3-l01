import fs from 'node:fs';
import path from 'node:path';

import { renderHook } from '@testing-library/react-native';
import { useWindowDimensions } from 'react-native';

import { BREAKPOINTS, CONTAINER_MAX_WIDTH } from '@/shared/theme/layout.generated';
import { useBreakpoint, useResponsiveValue } from '@/shared/theme/use-breakpoint';

/**
 * ⛔ Mock ở tầng MODULE của React Native, không mock `Dimensions`.
 *
 * `useWindowDimensions` đăng ký lắng nghe sự kiện đổi kích thước; giả lập bằng
 * cách chọc vào `Dimensions.get` thì hook vẫn giữ giá trị của lần vẽ đầu và mọi
 * ca test sau đều đọc cùng một bề rộng. `react-native/index.js` lấy hook này
 * bằng `require` nên mock module là cả hai lối nhập đều thấy.
 *
 * ⚠️ Vì vậy `jest.mock` trỏ vào đường dẫn SÂU (chuỗi, không cần kiểu) còn phần
 * `import` thì lấy từ `'react-native'`. ⛔ Đừng `import` thẳng đường dẫn sâu:
 * `react-native` không phát hành `.d.ts` cho `Libraries/**`, nên `tsc` đỏ
 * `TS7016 — implicitly has an 'any' type` và cổng kiểm chặn.
 */
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mockedUseWindowDimensions = useWindowDimensions as jest.MockedFunction<
  typeof useWindowDimensions
>;

/** Đặt kích thước cửa sổ cho ca test. Mặc định là máy dựng đứng. */
function setWindow(width: number, height = 800) {
  mockedUseWindowDimensions.mockReturnValue({ width, height, scale: 2, fontScale: 1 });
}

const ROOT = path.join(__dirname, '..', '..');

describe('Token breakpoint', () => {
  /**
   * File sinh phải khớp file nguồn — bắt ca sửa `layout.json` rồi quên chạy
   * `npm run generate:layout`. Lúc đó class `tablet:` và hook `useBreakpoint()`
   * đọc HAI ngưỡng khác nhau, và triệu chứng là bố cục nhảy một nửa: phần dùng
   * class đổi ở 600dp, phần dùng hook đổi ở số cũ.
   */
  it('khớp với layout.json (nhớ chạy generate:layout)', () => {
    const source = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'src/styles/layout/layout.json'), 'utf8'),
    ) as { breakpoint: Record<string, number> };

    expect(BREAKPOINTS).toEqual(source.breakpoint);
  });

  /**
   * ⛔ Tailwind sinh media query `min-width`, nên bậc sau PHẢI rộng hơn bậc
   * trước. Khai lộn thứ tự thì bậc hẹp ghi đè bậc rộng — CSS vẫn hợp lệ, không
   * lỗi nào báo, chỉ là máy tính bảng lấy đúng bố cục của điện thoại.
   */
  it('tăng dần và không có bậc 0', () => {
    const values = Object.values(BREAKPOINTS);

    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(new Set(values).size).toBe(values.length);
    for (const value of values) expect(value).toBeGreaterThan(0);
  });
});

describe('Token trần bề rộng (`container`)', () => {
  /** Cùng lý do với breakpoint: class `max-w-content` và phép tính dùng `CONTAINER_MAX_WIDTH` phải đọc CÙNG số. */
  it('khớp với layout.json (nhớ chạy generate:layout)', () => {
    const source = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'src/styles/layout/layout.json'), 'utf8'),
    ) as { container: Record<string, number> };

    expect(CONTAINER_MAX_WIDTH).toEqual(source.container);
  });

  /**
   * ⛔ Trần được bật bằng `tablet:` ⇒ trần hẹp hơn ngưỡng thì đúng lúc chạm 600dp khối nội dung
   * CO GIẬT một nấc (kéo thanh chia đôi màn hình là thấy). `generate-layout` chặn cứng; test giữ
   * cho bộ sinh khỏi lặng lẽ mất bước kiểm đó.
   */
  it('trần nội dung không hẹp hơn ngưỡng tablet — lề hai bên mở ra liên tục, không nhảy nấc', () => {
    expect(CONTAINER_MAX_WIDTH.content).toBeGreaterThanOrEqual(BREAKPOINTS.tablet);
  });
});

describe('useBreakpoint', () => {
  it.each([
    [320, 'base', false],
    [389, 'base', false],
    [390, 'phone', false],
    [599, 'phone', false],
    [600, 'tablet', true],
    [839, 'tablet', true],
    [840, 'tablet-lg', true],
    [1280, 'tablet-lg', true],
  ])('bề rộng %ipx → bậc "%s"', async (width, tier, isTablet) => {
    setWindow(width);
    const { result } = await renderHook(() => useBreakpoint());

    expect(result.current.tier).toBe(tier);
    expect(result.current.isTablet).toBe(isTablet);
  });

  /**
   * ⚠️ "Nằm ngang" so bề RỘNG với bề CAO, còn `isTablet` so với ngưỡng 600.
   * Hai thứ khác nhau: cửa sổ chia đôi màn hình trên máy tính bảng có thể rộng
   * hơn 600 mà vẫn cao hơn rộng — lúc đó bố cục hai cột là ĐÚNG, còn coi nó
   * "đang nằm ngang" thì sai.
   */
  it('phân biệt nằm ngang với máy tính bảng', async () => {
    setWindow(700, 900);
    const { result } = await renderHook(() => useBreakpoint());

    expect(result.current.isTablet).toBe(true);
    expect(result.current.isLandscape).toBe(false);
  });
});

describe('useResponsiveValue', () => {
  it('máy hẹp lấy giá trị `base`', async () => {
    setWindow(360);
    const { result } = await renderHook(() => useResponsiveValue({ base: 1, tablet: 2 }));

    expect(result.current).toBe(1);
  });

  it('máy tính bảng lấy giá trị `tablet`', async () => {
    setWindow(700);
    const { result } = await renderHook(() => useResponsiveValue({ base: 1, tablet: 2 }));

    expect(result.current).toBe(2);
  });

  /**
   * Bậc chưa khai thì KẾ THỪA bậc hẹp hơn — cùng luật với `min-width` của CSS.
   * Không có luật này thì mỗi lần thêm một bậc mới vào thang là phải đi khai lại
   * ở mọi nơi gọi, và nơi nào quên thì rơi thẳng về `base` (bố cục điện thoại
   * hiện trên máy tính bảng).
   */
  it('bậc chưa khai thì kế thừa bậc hẹp hơn gần nhất', async () => {
    setWindow(1000); // tablet-lg, nhưng chỉ khai tới `tablet`
    const { result } = await renderHook(() => useResponsiveValue({ base: 1, tablet: 2 }));

    expect(result.current).toBe(2);
  });

  it('khai đủ ba bậc thì lấy đúng bậc rộng nhất đã qua', async () => {
    setWindow(900);
    const { result } = await renderHook(() =>
      useResponsiveValue({ base: 1, phone: 2, tablet: 3, 'tablet-lg': 4 }),
    );

    expect(result.current).toBe(4);
  });
});
