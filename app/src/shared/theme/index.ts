/**
 * Hệ token — màu, chữ và số đo hình học, gom về MỘT cửa: `@/shared/theme`.
 *
 * Bên NGUỒN, mỗi nhóm token có thư mục riêng trong `src/styles/` vì chúng đổi
 * theo những nhịp khác nhau (xem README, mục "Design token sinh từ JSON"). Bên
 * TIÊU THỤ thì gộp lại một barrel, để component chỉ cần nhớ một đường dẫn.
 *
 * ⛔ Ba file `*.generated.*` sinh từ JSON, ĐỪNG sửa tay:
 *
 *   | File sinh ra              | Nguồn                                    | Lệnh                        |
 *   |---------------------------|------------------------------------------|-----------------------------|
 *   | `colors.generated.ts`     | `src/styles/colors/colors.json`           | `npm run generate:colors`     |
 *   | `typography.generated.ts` | `src/styles/typography/typography.json`   | `npm run generate:typography` |
 *   | `layout.generated.ts`     | `src/styles/layout/layout.json`           | `npm run generate:layout`     |
 */
export { DARK_COLORS, LIGHT_COLORS, THEME_COLOR_KEYS, TOKEN_ALPHA } from './colors.generated';
export type { ThemeColorKey } from './colors.generated';

export {
  FONT_FAMILY,
  FONT_WEIGHTS,
  TEXT_STYLES,
  TYPOGRAPHY_ROLES,
  UPPERCASE_ROLES,
} from './typography.generated';
export type { FontWeightName, TypographyRole } from './typography.generated';

export {
  BORDER_WIDTH,
  BREAKPOINTS,
  CONTAINER_MAX_WIDTH,
  CONTROL_HEIGHT,
  ICON_SIZE,
  RADIUS,
  SPACING,
} from './layout.generated';
export type {
  BreakpointToken,
  ContainerToken,
  ControlSize,
  IconSize,
  RadiusToken,
  SpacingToken,
} from './layout.generated';

export { useCaretColors } from './use-caret-colors';

export { useBreakpoint, useResponsiveValue } from './use-breakpoint';
export type { ResponsiveTier, ResponsiveValue } from './use-breakpoint';

export { useResolvedTheme, useThemeColor, useThemeColors } from './use-theme-colors';
