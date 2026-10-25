import { useMemo } from 'react';
import { SvgXml } from 'react-native-svg';

import { ICON_SIZE, useThemeColors, type IconSize, type ThemeColorKey } from '@/shared/theme';
import { logger } from '@/shared/utils/logger';

import { BANK_ICONS } from './icons.bank.generated';
import { FEATURE_ICONS } from './icons.feature.generated';
import { SYSTEM_ICONS } from './icons.system.generated';
import type { IconName } from './icon-names.generated';

/**
 * Biểu tượng — bộ icon BIDV SmartBanking xuất thẳng từ Figma.
 *
 * ```tsx
 * <Icon name="home" />                                  // 24dp, màu fg-1
 * <Icon name="alert-warning" color="warning" size="lg" />
 * <Icon name="setting" variant="twotone" />             // hai tông
 * <Icon name="bank/bidv" size={32} />                   // logo, giữ màu gốc
 * ```
 *
 * ── Vì sao KHÔNG dùng `@expo/vector-icons` ──────────────────────────────────
 * Ionicons là bộ icon của hệ điều hành Apple, không phải của ngân hàng: nét,
 * bo góc và ngữ nghĩa (cái nào là "chuyển tiền", cái nào là "tra soát") đều
 * lệch với bản thiết kế. Bộ này xuất từ chính file Figma nên khớp 100%, và khi
 * ngân hàng cập nhật icon thì chạy lại `npm run generate:icons` là xong.
 *
 * ── Ba nhóm tên ─────────────────────────────────────────────────────────────
 *   `home`           — icon giao diện, nhuộm được, có 4 biến thể nét
 *   `fn/ve-may-bay`  — icon dịch vụ, hai tông
 *   `bank/bidv`      — logo ngân hàng, ⛔ KHÔNG nhuộm (sai nhận diện của họ)
 */

export type IconVariant = 'linear' | 'solid' | 'twotone' | 'bulk';

export interface IconProps {
  name: IconName;
  /** Token cỡ (`md` = 24dp) hoặc số dp cụ thể khi thiết kế đòi cỡ lẻ. */
  size?: IconSize | number;
  /** Màu nét chính. ⛔ Chỉ nhận token — đừng truyền mã hex. */
  color?: ThemeColorKey;
  /** Màu nét nhấn của icon hai tông. Bỏ qua với icon một tông. */
  accentColor?: ThemeColorKey;
  /** Chỉ có tác dụng với nhóm `system`. Nhóm khác chỉ có một kiểu nét. */
  variant?: IconVariant;
  /**
   * Nhãn cho trình đọc màn hình. Bỏ trống = icon TRANG TRÍ và bị ẩn khỏi
   * trình đọc — đúng cho icon nằm cạnh chữ đã nói rõ nghĩa. Icon đứng MỘT MÌNH
   * làm nút thì nhãn nằm ở nút bọc ngoài, không phải ở đây.
   */
  label?: string;
}

/** Chỗ trống mà `generate-icons.mjs` để lại cho nét nhấn. */
const ACCENT_SLOT = /%A%/g;

function lookup(name: string) {
  if (name.startsWith('bank/')) return { xmlByVariant: BANK_ICONS[name.slice(5)], tintable: false };
  if (name.startsWith('fn/')) return { xmlByVariant: FEATURE_ICONS[name.slice(3)], tintable: true };
  return { xmlByVariant: SYSTEM_ICONS[name], tintable: true };
}

export function Icon({
  accentColor = 'action-accent',
  color = 'fg-1',
  label,
  name,
  size = 'md',
  variant = 'linear',
}: IconProps) {
  const colors = useThemeColors();
  const { tintable, xmlByVariant } = lookup(name);

  /**
   * Biến thể thiếu thì rơi về `linear` rồi mới tới biến thể đầu tiên có thật.
   *
   * Không phải icon nào cũng đủ 4 nét — bộ của ngân hàng có icon chỉ có
   * `linear`. Ném lỗi ở đây thì một prop gõ nhầm làm trắng cả màn hình; rơi về
   * nét khác thì người dùng vẫn thấy đúng icon, chỉ khác kiểu nét.
   */
  const xml = useMemo(() => {
    if (!xmlByVariant) return null;
    const raw = xmlByVariant[variant] ?? xmlByVariant.linear ?? Object.values(xmlByVariant)[0];
    if (!raw) return null;
    return tintable ? raw.replace(ACCENT_SLOT, colors[accentColor]) : raw;
  }, [xmlByVariant, variant, tintable, colors, accentColor]);

  if (__DEV__ && !xml) {
    // Cảnh báo LÚC PHÁT TRIỂN, không ném lỗi lúc chạy: icon thiếu là lỗi hiển
    // thị, không đáng để làm sập màn hình của người dùng cuối.
    logger.warn(`[Icon] không có icon tên "${name}" — chạy \`npm run generate:icons\` chưa?`);
  }
  if (!xml) return null;

  const px = typeof size === 'number' ? size : ICON_SIZE[size];

  return (
    <SvgXml
      accessibilityRole={label ? 'image' : undefined}
      accessible={Boolean(label)}
      aria-label={label}
      /**
       * ⛔ `color` là thứ làm `currentColor` trong file SVG có tác dụng — đó là
       * toàn bộ cơ chế nhuộm icon. Bỏ nó thì icon vẫn hiện, nhưng luôn giữ màu
       * xanh của bản thiết kế và không đổi theo theme.
       *
       * Logo ngân hàng KHÔNG có `currentColor` trong file nên prop này không
       * ảnh hưởng — màu thương hiệu của họ giữ nguyên.
       */
      color={colors[color]}
      height={px}
      /* Icon trang trí phải ẩn khỏi trình đọc màn hình, nếu không người dùng
         khiếm thị nghe "hình ảnh" xen giữa từng dòng chữ. */
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
      width={px}
      xml={xml}
    />
  );
}
