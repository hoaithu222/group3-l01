import { useWindowDimensions } from 'react-native';

import { BREAKPOINTS, type BreakpointToken } from './layout.generated';

/** Bậc hẹp nhất — máy dưới 390dp (iPhone SE, Android 360dp). Không có tiền tố class. */
export type ResponsiveTier = 'base' | BreakpointToken;

/**
 * Giá trị theo bậc màn hình. Thiếu bậc nào thì rơi xuống bậc HẸP hơn gần nhất
 * — cùng luật kế thừa với `min-width` của CSS, nên đọc `{ base, tablet }` là
 * biết ngay "điện thoại dùng base, từ 600dp trở lên dùng tablet".
 */
export type ResponsiveValue<T> = { base: T } & Partial<Record<BreakpointToken, T>>;

/** Thứ tự từ HẸP tới RỘNG. Dùng để dò ngược khi tìm giá trị áp dụng. */
const TIERS: ResponsiveTier[] = ['base', 'phone', 'tablet', 'tablet-lg'];

/**
 * Bậc màn hình hiện tại.
 *
 * ── ⛔ Vì sao KHÔNG dùng `Dimensions.get('window')` ─────────────────────────
 * `Dimensions.get()` đọc MỘT lần rồi thôi. Xoay máy, mở chế độ chia đôi màn
 * hình trên Android, hay kéo cửa sổ Stage Manager trên iPad đều đổi bề rộng mà
 * component không vẽ lại — bố cục kẹt ở kích thước lúc mở màn. `useWindowDimensions`
 * là hook, có đăng ký lắng nghe nên vẽ lại đúng lúc.
 *
 * ── Số đo lấy từ ĐÂU ────────────────────────────────────────────────────────
 * `BREAKPOINTS` sinh từ `src/styles/layout/layout.json` — CÙNG con số với class
 * `tablet:`. ⛔ Đừng viết `width >= 600` tại chỗ: lệch với class là bố cục nhảy
 * ở đúng một bề rộng và không ai lần ra vì sao.
 *
 * ```tsx
 * const { isTablet, isLandscape } = useBreakpoint();
 * <FlashList numColumns={isTablet ? 3 : 2} … />
 * ```
 */
export function useBreakpoint() {
  const { height, width } = useWindowDimensions();

  const tier: ResponsiveTier =
    width >= BREAKPOINTS['tablet-lg']
      ? 'tablet-lg'
      : width >= BREAKPOINTS.tablet
        ? 'tablet'
        : width >= BREAKPOINTS.phone
          ? 'phone'
          : 'base';

  return {
    height,
    /**
     * ⚠️ So bề RỘNG, không so `width > height`. Điện thoại gập và chế độ chia
     * đôi màn hình cho ra cửa sổ cao-hơn-rộng nhưng vẫn rộng hơn 600dp: bố cục
     * hai cột ở đó là đúng, còn "đang nằm ngang" thì sai.
     */
    isTablet: width >= BREAKPOINTS.tablet,
    isLandscape: width > height,
    tier,
    width,
  };
}

/**
 * Chọn giá trị theo bậc màn hình, cho prop KHÔNG nhận `className`.
 *
 * ```tsx
 * const columns = useResponsiveValue({ base: 1, tablet: 2, 'tablet-lg': 3 });
 * const lines = useResponsiveValue({ base: 2, tablet: 1 });
 * ```
 *
 * ⚠️ Ở JSX có `className` thì ⛔ ĐỪNG dùng hook này — viết
 * `className="flex-col tablet:flex-row"`. Hook chạy lại và vẽ lại cả cây con ở
 * MỖI nhịp đổi kích thước (kéo chia đôi màn hình là hàng chục nhịp/giây), còn
 * class thì NativeWind xử ở tầng style, không vẽ lại.
 */
export function useResponsiveValue<T>(value: ResponsiveValue<T>): T {
  const { tier } = useBreakpoint();

  // Dò NGƯỢC từ bậc hiện tại về `base`: bậc chưa khai thì kế thừa bậc hẹp hơn.
  for (let index = TIERS.indexOf(tier); index >= 0; index -= 1) {
    const key = TIERS[index];
    if (key === undefined) continue;
    const candidate = value[key as BreakpointToken];
    if (candidate !== undefined) return candidate;
  }

  return value.base;
}
