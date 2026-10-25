import { useId } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { Circle, Defs, G, RadialGradient, Rect, Stop, Svg } from 'react-native-svg';

import { useThemeColors } from '@/shared/theme';

/**
 * ⛔ Nhập THẲNG từ file, KHÔNG qua `@/shared/ui` — cùng lý do với `EmptyStateActions` (import vòng qua barrel tổng).
 */
import { BANNER_TONE, type BannerTone } from '../banner/banner-tone';
import { useLoopProgress } from '../effects/useLoopProgress';
import { Icon } from '../icon/Icon';
import type { IconName } from '../icon/icon-names.generated';
import { MOTION_LOOP } from '../motion/motion.tokens';
import { Reveal } from '../motion/Reveal';

interface EmptyStateIllustrationProps {
  icon: IconName;
  size: 'compact' | 'full';
  tone: BannerTone;
}

/**
 * Hình minh hoạ mặc định của `EmptyState` khi nơi gọi chỉ đưa `icon` (+ `tone`): quầng sáng toả tròn, quỹ đạo nét đứt có hai
 * "vệ tinh" nhỏ bay quanh, đĩa tông có icon lớn hai tông ở giữa, vài chấm lấp lánh cho đỡ trống. Không cần file ảnh nào —
 * dựng bằng `react-native-svg` + token màu, nên đổi theo chế độ sáng/tối và đủ dùng cho hàng trăm màn rỗng/lỗi.
 *
 * ── Số đo ───────────────────────────────────────────────────────────────────────────────────────────────────────────
 * Vẽ trong hệ toạ độ 160×160 (đúng khung minh hoạ Figma `h-40 w-40`) rồi co theo khung: `compact` (120) chỉ là cùng một
 * hình thu nhỏ 0.75 nên hai cỡ luôn cân đối. Mọi lớp phủ là màu NÉT của tông ở 6–22% độ đậm — nằm được trên cả nền
 * `bg-base` lẫn thẻ trắng, và ở chế độ tối vẫn nhìn thấy nhờ màu tông đã là bản SÁNG. Quỹ đạo bán kính 68: hai vệ tinh đặt
 * ĐÚNG trên vòng đó (góc −50° ⇒ (124, 28) và 140° ⇒ (28, 124)), đổi bán kính thì tính lại toạ độ vệ tinh, không thì chúng
 * trôi khỏi quỹ đạo.
 *
 * ⚠️ Màu lấy qua `useThemeColors()` chứ không `className`: `fill`/`stroke` của SVG không nhận class (NativeWind bỏ qua
 * ÂM THẦM ⇒ hình ra đen). Icon ở giữa là `View` bình thường xếp chồng lên SVG nhờ khung cha canh giữa.
 * ⚠️ `id` của gradient lấy từ `useId()` (bỏ dấu `:` — `url(#:r1:)` không phân tích được): hai `EmptyState` cùng màn (hai tab)
 * mà chung một `id` cố định thì bản sau có thể lấy nhầm màu tông của bản trước.
 *
 * ✅ Hình "nảy" nhẹ lúc xuất hiện (`Reveal kind="zoom"`); quỹ đạo + hai vệ tinh QUAY rất chậm (`MOTION_LOOP.orbit`, một
 * vòng/28 s) — hình có "sự sống" mà không giành mắt với câu chữ. Cả hai tự tắt khi bật "Giảm chuyển động".
 * ⚠️ Lớp quỹ đạo là SVG RIÊNG trong một `Animated.View` xoay quanh tâm khung: vệ tinh đặt ĐÚNG trên quỹ đạo nên xoay cả lớp
 * là vệ tinh "bay" theo đường chấm. Tâm xoay = tâm view = (80, 80) của hệ toạ độ — đổi tâm hình là đổi luôn chỗ này.
 */
export function EmptyStateIllustration({ icon, size, tone }: EmptyStateIllustrationProps) {
  const colors = useThemeColors();
  const glowId = `es-glow-${useId().replace(/:/g, '')}`;
  const ink = colors[BANNER_TONE[tone].ink];
  const surface = colors[BANNER_TONE[tone].surface];
  const orbit = useLoopProgress({ active: true, duration: MOTION_LOOP.orbit });
  const orbitStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${360 * orbit.get()}deg` }],
  }));

  return (
    <Reveal className="h-full w-full items-center justify-center" kind="zoom">
      {/* Lớp vẽ nằm tuyệt đối để không đẩy icon lệch khỏi tâm khung. */}
      <Svg height="100%" style={{ position: 'absolute' }} viewBox="0 0 160 160" width="100%">
        <Defs>
          <RadialGradient cx="50%" cy="50%" id={glowId} r="50%">
            <Stop offset="0" stopColor={ink} stopOpacity={0.16} />
            <Stop offset="0.65" stopColor={ink} stopOpacity={0.06} />
            <Stop offset="1" stopColor={ink} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx="80" cy="80" fill={`url(#${glowId})`} r="80" />
        <Circle cx="80" cy="80" fill={ink} fillOpacity={0.07} r="54" />
        <Circle
          cx="80"
          cy="80"
          fill={surface}
          r="42"
          stroke={ink}
          strokeOpacity={0.22}
          strokeWidth="1"
        />
        {/* Chấm lấp lánh — ngoài quỹ đạo, đứng yên (chỉ quỹ đạo quay). */}
        <Circle cx="30" cy="42" fill={ink} fillOpacity={0.32} r="3.5" />
        <Circle cx="142" cy="106" fill={ink} fillOpacity={0.28} r="2.5" />
        <Circle
          cx="116"
          cy="142"
          fill="none"
          r="5"
          stroke={ink}
          strokeOpacity={0.3}
          strokeWidth="1.5"
        />
      </Svg>
      {/* ⛔ `cssInterop={false}`: mảng [phủ kín, handle xoay] — NativeWind gộp là lớp quỹ đạo mất khung (cao 0, biến mất). */}
      <Animated.View cssInterop={false} style={[StyleSheet.absoluteFill, orbitStyle]}>
        <Svg height="100%" viewBox="0 0 160 160" width="100%">
          {/* Quỹ đạo nét đứt — đầu nét tròn cho mềm, như đường chấm của hình minh hoạ "trạng thái rỗng" phổ biến. */}
          <Circle
            cx="80"
            cy="80"
            fill="none"
            r="68"
            stroke={ink}
            strokeDasharray="2 7"
            strokeLinecap="round"
            strokeOpacity={0.3}
            strokeWidth="1.5"
          />
          {/* Vệ tinh 1 (góc −50°): ô vuông bo nghiêng 15° có chấm giữa — gợi "một mục" đang chờ được thêm vào. */}
          <G origin="124, 28" rotation={15}>
            <Rect
              fill={surface}
              height="16"
              rx="5"
              stroke={ink}
              strokeOpacity={0.4}
              strokeWidth="1.2"
              width="16"
              x="116"
              y="20"
            />
          </G>
          <Circle cx="124" cy="28" fill={ink} fillOpacity={0.5} r="2.5" />
          {/* Vệ tinh 2 (góc 140°): đĩa tròn hai lớp. */}
          <Circle cx="28" cy="124" fill={ink} fillOpacity={0.16} r="8" />
          <Circle cx="28" cy="124" fill={ink} fillOpacity={0.45} r="3" />
        </Svg>
      </Animated.View>
      <Icon
        color={BANNER_TONE[tone].ink}
        name={icon}
        size={size === 'full' ? 'xl' : 'lg'}
        variant="twotone"
      />
    </Reveal>
  );
}
