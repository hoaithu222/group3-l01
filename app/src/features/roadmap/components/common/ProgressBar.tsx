import { View } from 'react-native';
import { tv } from 'tailwind-variants';

import type { IconTileTone } from '@/shared/ui/icon-tile';
import { twMergeConfig } from '@/shared/utils/style/cn';

export interface ProgressBarProps {
  /** Có thì thanh thành MỘT ô trợ năng `progressbar` đọc câu này; bỏ trống khi chữ bên cạnh đã nói đủ (trang trí). */
  accessibilityLabel?: string;
  className?: string;
  /** 0..100 (ngoài khoảng bị kẹp, `NaN` = 0). */
  percent: number;
  size?: 'sm' | 'md';
  /** Cùng bảy tông của `IconTile` — thanh của một tháng mang màu tháng (`phaseTone`). */
  tone?: IconTileTone;
}

/**
 * Thanh tiến độ NGANG của lộ trình (môn, tháng, checklist tự kiểm tra).
 *
 * ⚠️ Viết cục bộ vì bộ chung chưa có thanh % tổng quát: `Progress` là dòng thời gian DỌC nhiều bước, `ProgressRing` là
 * vòng tròn, `AttachmentProgress` gắn nghĩa "đang tải lên" (nhãn mặc định, một tông `action-base`). Lộ trình cần tô theo
 * MÀU THÁNG và nhãn tiến độ học — dùng ở feature thứ hai thì chuyển lên `src/shared/ui/` (ui-components.md §7).
 *
 * ⛔ Phần tô KHÔNG vẽ khi 0%: một `View` bề rộng 0 mà `rounded-full` hiện ra thành một CHẤM tròn ở đầu thanh (ảnh chụp
 * thật ở thẻ môn) — người học đọc thành "đã học được một chút". Rãnh dùng `border-1` chứ không `bg-3`: `bg-3` gần
 * trùng nền thẻ trắng (#F6F6F6 trên #FFFFFF), rãnh gần như vô hình và thanh 0% trông như không có gì.
 */
const bar = tv(
  {
    slots: { fill: 'h-full rounded-full', track: 'w-full overflow-hidden rounded-full bg-border-1' },
    variants: {
      size: { md: { track: 'h-2' }, sm: { track: 'h-1' } },
      tone: {
        accent: { fill: 'bg-action-accent' },
        brand: { fill: 'bg-action-base' },
        danger: { fill: 'bg-error' },
        info: { fill: 'bg-info' },
        neutral: { fill: 'bg-fg-2' },
        success: { fill: 'bg-success' },
        warning: { fill: 'bg-warning' },
      },
    },
    defaultVariants: { size: 'md', tone: 'brand' },
  },
  { twMergeConfig },
);

export function ProgressBar({ accessibilityLabel, className, percent, size = 'md', tone = 'brand' }: ProgressBarProps) {
  const clamped = Number.isFinite(percent) ? Math.max(0, Math.min(100, Math.round(percent))) : 0;
  const styles = bar({ size, tone });

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'progressbar' : undefined}
      accessibilityValue={accessibilityLabel ? { max: 100, min: 0, now: clamped } : undefined}
      accessible={Boolean(accessibilityLabel)}
      className={styles.track({ className })}
    >
      {/* ⚠️ KHÔNG `String(...)` quanh số — `DimensionValue` của RN chỉ nhận literal `${number}%` (đã đỏ `tsc`). */}
      {clamped > 0 ? <View className={styles.fill()} style={{ width: `${clamped}%` }} /> : null}
    </View>
  );
}
