import { Text, View } from 'react-native';
import { tv, type VariantProps } from 'tailwind-variants';

import type { ThemeColorKey } from '@/shared/theme';
import { Icon, type IconName } from '@/shared/ui/icon';
import { twMergeConfig } from '@/shared/utils/style/cn';

const pill = tv(
  {
    slots: {
      // `max-w-full`: nhãn dài (tên loại mục + số) không được đẩy hàng viên thuốc tràn khỏi cột; `self-start` để viên co theo chữ.
      root: 'max-w-full flex-row items-center gap-3xs self-start rounded-full px-xs py-3xs',
      label: 'shrink text-caption-sm font-medium',
    },
    variants: {
      tone: {
        // `neutral`: số liệu (số mục, phạm vi). Viền hairline vì nền `bg-3` chỉ hơn thẻ trắng ~8% ở chế độ sáng.
        neutral: { root: 'border-hairline border-border-1 bg-bg-3', label: 'text-fg-2' },
        // `brand`: thẻ (#tag) — cặp `surface-primary` + `fg-brand` đã đo (15.5:1 sáng, 5.2:1 tối).
        brand: { root: 'bg-surface-primary', label: 'text-fg-brand' },
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
  { twMergeConfig },
);

export interface StatPillProps extends VariantProps<typeof pill> {
  className?: string;
  /** Icon đứng trước chữ (tuỳ chọn — thẻ #tag không có). */
  icon?: IconName;
  /** Màu icon. Mặc định `fg-2`; dùng màu ngữ nghĩa (`info`, `success`, `warning`) để quét nhanh — ⚠️ chữ vẫn luôn có, màu không phải kênh duy nhất. */
  iconColor?: ThemeColorKey;
  label: string;
}

/**
 * Viên thuốc số liệu KHÔNG bấm được: icon nhỏ + một cụm chữ ngắn ("12 mục", "Riêng tư", "Chuỗi 3 ngày", "#toán").
 *
 * ── Vì sao viết cục bộ mà không dùng `Badge`/`Chip` ────────────────────────────────────────────────────────────────
 * `Chip` là CONTROL (bấm được, chọn được — vai trợ năng `button`/`checkbox`) nên dùng cho nhãn tĩnh là nói dối trình đọc màn hình;
 * `Badge` là nhãn TRẠNG THÁI (không có khe icon, tông theo nghĩa `success`/`error`…). Số liệu có icon dẫn đầu là nhu cầu của bộ
 * học (số mục, phạm vi, chuỗi ôn) và chưa có ở bộ chung; dùng ở ≥ 3 nơi trong feature (thẻ bộ, đầu trang tổng quan, thẻ "Hôm nay").
 * Nếu feature khác cũng cần thì đưa lên `src/shared/ui/` (đọc `src/shared/ui/AGENTS.md` trước).
 *
 * ⚠️ Cả viên gộp thành MỘT ô trợ năng đọc đúng `label` (icon không nhãn ⇒ bị ẩn), nên nơi gọi đưa chữ ĐỌC ĐƯỢC vào `label`.
 * `maxFontSizeMultiplier` + `numberOfLines={1}`: viên nằm trong hàng đã dày (3–4 viên/thẻ), chữ phóng 2× làm mỗi viên chiếm hết một
 * dòng — chặn TRẦN ở 1.3× (người dùng vẫn được phóng, tới một mức) thay vì `allowFontScaling={false}` (điều cấm ở `responsive.md`).
 */
export function StatPill({ className, icon, iconColor = 'fg-2', label, tone }: StatPillProps) {
  const styles = pill({ tone });
  return (
    <View accessibilityLabel={label} accessible className={styles.root({ className })}>
      {icon ? <Icon color={iconColor} name={icon} size={14} variant="twotone" /> : null}
      <Text className={styles.label()} maxFontSizeMultiplier={1.3} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
