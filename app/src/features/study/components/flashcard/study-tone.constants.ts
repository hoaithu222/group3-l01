import type { ThemeColorKey } from '@/shared/theme';
import type { IconTileTone } from '@/shared/ui/icon-tile';

/** Hai chế độ có phiên thẻ lật — `STUDY_MODE_META` giữ màu/icon/tên của từng chế độ. */
export type CardMode = 'flashcards' | 'sr';

/**
 * Bảng tông → lớp/màu cho các hình VẼ RIÊNG của phiên thẻ (thanh tiến độ, vòng hoàn thành, mặt sau của thẻ).
 *
 * ── Vì sao có bảng này mà không dùng thẳng `IconTile`/`ProgressRing` ──────────────────────────────────────────────────
 * `IconTile` chỉ xuất ô icon (không xuất bảng tông), `ProgressRing` chỉ có ba tông và vẽ đường nền bằng `bg-3` (trên nền màn
 * `bg-base` gần như vô hình: 246 vs 240/245/245 ở chế độ sáng). Ở đây có đủ bảy tông của `IconTile` để `STUDY_MODE_META` chọn
 * tông nào cũng vẽ được, và đường nền dùng `border-2` (đo được: nổi khỏi nền màn ở cả hai chế độ).
 * ⛔ Mọi cặp là token VAI TRÒ đã đo tương phản (`action-*`, `surface-*`, `border-*`) — đừng thêm hex hay thang số.
 */

/** Màu ĐẶC của phần đã chạy (thanh, vòng). */
export const TONE_FILL: Record<IconTileTone, string> = {
  accent: 'bg-action-accent',
  brand: 'bg-action-base',
  danger: 'bg-action-error',
  info: 'bg-action-info',
  neutral: 'bg-action-grey',
  success: 'bg-action-success',
  warning: 'bg-action-warning',
};

/** Cùng màu ở dạng token cho `react-native-svg` (không nhận className). */
export const TONE_COLOR: Record<IconTileTone, ThemeColorKey> = {
  accent: 'action-accent',
  brand: 'action-base',
  danger: 'action-error',
  info: 'action-info',
  neutral: 'action-grey',
  success: 'action-success',
  warning: 'action-warning',
};

/** Nền + viền NHẠT của mặt sau thẻ (mặt trước luôn `bg-1` trung tính → nhìn là biết đang xem đáp án). */
export const TONE_BACK_FACE: Record<IconTileTone, string> = {
  accent: 'border-border-1 bg-surface-secondary',
  brand: 'border-border-brand-subtle bg-surface-primary',
  danger: 'border-border-error-subtle bg-surface-error',
  info: 'border-border-info-subtle bg-surface-info',
  neutral: 'border-border-1 bg-surface-neutral',
  success: 'border-border-success-subtle bg-surface-success',
  warning: 'border-border-warning-subtle bg-surface-warning',
};

/** Đường nền của thanh/vòng tiến độ — `border-2` (xem chú thích đầu file). */
export const TRACK_CLASS = 'bg-border-2';
export const TRACK_COLOR: ThemeColorKey = 'border-2';
