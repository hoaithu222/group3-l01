import type { ThemeColorKey } from '@/shared/theme';

import type { IconTileTone } from '../icon-tile/IconTile';

/**
 * Bảng tông màu của "hình minh hoạ dựng bằng SVG" (banner đầu phân hệ, hình của `EmptyState`) — CÙNG bảy tông với
 * `IconTile` để một màn có ô icon lẫn banner thì hai thứ khớp màu nhau.
 *
 * ── Vì sao có bảng RIÊNG thay vì dùng `className` ────────────────────────────────────────────────────────────────
 * Hình vẽ bằng `react-native-svg`: `fill`/`stroke`/`stopColor` chỉ nhận MÀU (hex), không nhận `className` — class đặt lên
 * đó bị NativeWind bỏ qua ÂM THẦM và hình ra đen thui. Nên phải lấy hex từ `useThemeColors()` theo TÊN TOKEN; bảng này
 * chỉ nói tên token nào cho tông nào (⛔ không chép hex — hex đổi theo sáng/tối, token thì tự đổi).
 *
 * `surface` = nền nhạt của tông (cùng họ với nền `IconTile`); `ink` = màu nét/icon đậm hơn cùng họ.
 */
export type BannerTone = IconTileTone;

export const BANNER_TONE: Record<BannerTone, { ink: ThemeColorKey; surface: ThemeColorKey }> = {
  accent: { ink: 'action-accent', surface: 'surface-secondary' },
  brand: { ink: 'fg-brand', surface: 'surface-primary' },
  danger: { ink: 'error', surface: 'surface-error' },
  info: { ink: 'info', surface: 'surface-info' },
  neutral: { ink: 'fg-2', surface: 'surface-neutral' },
  success: { ink: 'success', surface: 'surface-success' },
  warning: { ink: 'warning', surface: 'surface-warning' },
};
