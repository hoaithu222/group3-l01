import { Circle, Defs, G, LinearGradient, Rect, Stop, Svg } from 'react-native-svg';

import { SPACING, useResolvedTheme, useThemeColors } from '@/shared/theme';

import { BANNER_TONE, type BannerTone } from './banner-tone';

/**
 * Tâm quầng sáng = tâm ô icon của banner: lề phải (`px-md`) + nửa ô icon (`size-6xl` = 64). ⚠️ Đổi lề hay cỡ ô ở
 * `ModuleBanner` thì đổi ở đây, không thì quầng lệch khỏi icon (vòng tròn trông như trôi đi chỗ khác).
 */
const HALO_OFFSET = SPACING.md + SPACING['6xl'] / 2;

/**
 * Nền trang trí của `ModuleBanner` — dải gradient nhẹ + quầng tròn đồng tâm quanh ô icon ở mép PHẢI (nơi không có chữ).
 *
 * ── Vì sao vẽ bằng `react-native-svg` ────────────────────────────────────────────────────────────────────────────────
 * Cùng lý do với `ScreenGradient`: không thêm gói native, không có ảnh minh hoạ trong `assets/`. Tâm quầng đặt bằng
 * PHẦN TRĂM (`cy="50%"`) + dịch `G` từ mép phải, bán kính bằng dp cố định — nên hình bám theo ô icon ở mọi bề rộng
 * (dùng `viewBox` + `slice` thì vòng tròn phình theo chiều rộng banner ở máy tính bảng) và ở mọi chiều cao (banner có
 * khe hành động cao hơn thì ô icon vẫn canh giữa, quầng đi theo).
 *
 * ── ⛔ Vì sao chế độ SÁNG chỉ được LÀM SÁNG, không được làm tối ───────────────────────────────────────────────────────
 * Chữ mô tả là `fg-2` (#666) trên nền `surface-*`: chỉ đạt 4.8–5.3:1. Phủ thêm 6% màu đậm của tông là tụt xuống
 * 4.3–4.7 (rớt ngưỡng AA 4.5 với `brand`/`info`/`danger`). Nên ở chế độ sáng, lớp phủ và quầng đặc là màu `bg-1`
 * (trắng) — đáy phai về trắng thì chữ càng dễ đọc — còn màu đậm của tông chỉ đi vào NÉT MẢNH (vòng 1.5dp) và chấm nhỏ,
 * không phủ diện tích. Chế độ TỐI thì ngược lại: nền đã tối, phủ màu tông SÁNG ≤ 8% vẫn giữ `fg-2` ≥ 5:1 ở cả bảy tông.
 * Đổi các số ở `WASH` thì đo lại tương phản `fg-2` trên `surface-*` ở CẢ hai chế độ — `check:contrast` KHÔNG thấy được
 * (màu ở đây là hex trong SVG chứ không phải `className`).
 *
 * ⚠️ Chỉ TRANG TRÍ: nơi đặt (`ModuleBanner`) đã ẩn nó khỏi trình đọc màn hình và cho `pointerEvents="none"`.
 */
const WASH = {
  // `edge`: độ phủ ở mép phải của dải gradient; `blob`: độ phủ của quầng đặc.
  dark: { blob: 0.07, edge: 0.08, ring: 0.3 },
  light: { blob: 0.6, edge: 0.35, ring: 0.28 },
} as const;

export function BannerBackdrop({ tone }: { tone: BannerTone }) {
  const colors = useThemeColors();
  const theme = useResolvedTheme();
  const { ink, surface } = BANNER_TONE[tone];
  const wash = WASH[theme];
  // Sáng: phủ trắng (`bg-1`) cho phai dần; tối: phủ chính màu tông cho sáng lên một chút.
  const washColor = theme === 'light' ? colors['bg-1'] : colors[ink];

  return (
    <Svg height="100%" width="100%">
      <Defs>
        <LinearGradient id="banner-wash" x1="0" x2="1" y1="0" y2="0.5">
          <Stop offset="0.3" stopColor={washColor} stopOpacity="0" />
          <Stop offset="1" stopColor={washColor} stopOpacity={wash.edge} />
        </LinearGradient>
      </Defs>
      <Rect fill={colors[surface]} height="100%" width="100%" x="0" y="0" />
      <Rect fill="url(#banner-wash)" height="100%" width="100%" x="0" y="0" />
      {/* Quầng đồng tâm quanh ô icon: hai đĩa đặc (lớn mờ hơn) + một vòng viền mảnh — nét đậm của tông nằm ở vòng viền. */}
      <G translateX={-HALO_OFFSET}>
        <Circle cx="100%" cy="50%" fill={washColor} fillOpacity={wash.blob * 0.55} r="78" />
        <Circle cx="100%" cy="50%" fill={washColor} fillOpacity={wash.blob} r="54" />
        <Circle
          cx="100%"
          cy="50%"
          fill="none"
          r="64"
          stroke={colors[ink]}
          strokeOpacity={wash.ring}
          strokeWidth="1.5"
        />
        {/* Hai chấm nhỏ neo theo tâm quầng (không theo phần trăm bề rộng — máy tính bảng sẽ trôi vào vùng chữ). */}
        <G translateX={38} translateY={-40}>
          <Circle cx="100%" cy="50%" fill={colors[ink]} fillOpacity={0.32} r="2.5" />
        </G>
        <G translateX={-4} translateY={40}>
          <Circle cx="100%" cy="50%" fill={colors[ink]} fillOpacity={0.4} r="3" />
        </G>
      </G>
      {/* Một đĩa nhỏ ở góc dưới-phải, bị mép banner cắt bớt — cho cảm giác hình "lan ra ngoài" chứ không nằm gọn trong khung. */}
      <Circle cx="100%" cy="100%" fill={washColor} fillOpacity={wash.blob * 0.7} r="26" />
    </Svg>
  );
}
