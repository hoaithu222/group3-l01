import { memo } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';

import { useIsScreenFocused } from '@/shared/hooks/useIsScreenFocused';
import { useBreakpoint } from '@/shared/theme';
import { GlowOrbs, Sparkles } from '@/shared/ui';
import { MOTION_DURATION, Reveal } from '@/shared/ui/motion';
import { useBookMotion } from '@/features/auth/hooks/useBookMotion';

import { useAuthHero } from './AuthHeroProvider';
import { AuthBook } from './book/AuthBook';
import { bookGeometry, type BookGeometry } from './book/book-geometry';

/**
 * Lớp sao tràn ra ngoài khung sách bấy nhiêu lần bề rộng bìa. Ngang 0.64 ⇒ cả bốn vị trí % đầu của `Sparkles` (6 · 90 ·
 * 84 · 14%) rơi NGOÀI mép sách — sao sát nhất (84%) còn cách mép bìa ~6dp; dọc 0.16 ⇒ hai sao ngang đầu sách, hai sao
 * ngang chân. ⚠️ Tính theo bảng `SPOTS` của `Sparkles` — bảng đó đổi thì tính lại.
 */
const SPARKLE_BLEED = { x: 0.64, y: 0.16 } as const;
/** Sao hiện khi sách đã gần mở hẳn (một nhịp gập/mở `emphasized`), tắt NHANH ngay lúc sách bắt đầu gập. */
const SPARKLES_IN = FadeIn.delay(MOTION_DURATION.emphasized).duration(MOTION_DURATION.base);
const SPARKLES_OUT = FadeOut.duration(MOTION_DURATION.fast);

/**
 * Đầu màn xác thực: QUYỂN SÁCH 3D mở ra lúc vào màn — bìa thương hiệu (logo) lật quanh gáy, sáu tờ toả ra, lộ trang trong có
 * ba ô phân hệ (tin nhắn · lịch họp · học tập) — nói luôn app gom những gì. Port từ flutterfx `book-open` (toán góc, thứ tự
 * vẽ, vì sao hai mặt bìa: `book/book-geometry.ts`; nhịp: `hooks/useBookMotion.ts`).
 *
 * ── Phản ứng theo form (`AuthHeroProvider`) ─────────────────────────────────────────────────────────────────────────
 * Màn Đăng nhập GẬP sách khi ô mật khẩu nhận bàn phím ("che mắt" — ẩn dụ riêng tư), mở lại khi rời ô, và lắc ngang một lần
 * khi dải lỗi hiện ra. Không có provider (Đăng ký, Quên/Đặt lại mật khẩu, Khôi phục, Khoá ứng dụng) ⇒ sách mở, đứng yên.
 *
 * ── Điểm nhấn quanh sách ────────────────────────────────────────────────────────────────────────────────────────────
 * `GlowOrbs` làm "sân khấu" phía sau (vòng lặp nổi bật DUY NHẤT của nhóm màn xác thực) + bốn sao `Sparkles` chỉ hiện khi
 * sách MỞ. ⛔ Quầng toả tròn `fg-brand` cũ đã bỏ: chồng lên `GlowOrbs` là hai lớp glow — ở chế độ sáng quầng mới làm SÁNG
 * nền, quầng cũ nhuộm TÍM đậm, trộn lại thành một vệt đục quanh sách.
 *
 * ── Cỡ ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
 * Nằm ngang (màn thấp, bàn phím ăn nửa màn) ⇒ sách còn một nửa và trang trong bỏ ô phân hệ, để form vào tầm mắt sớm hơn —
 * cùng ý với `landscape:size-20` của hình cũ. Cỡ là SỐ (transform 3D cần số thật) nên chọn bằng `useBreakpoint()`, không
 * bằng class `landscape:`.
 *
 * ⛔ Trang trí thuần: cả khối ẩn khỏi trình đọc màn hình (hai prop ĐI CÙNG NHAU — iOS nghe prop đầu, Android nghe prop sau);
 * tên màn nằm ở tiêu đề bên dưới. `accessibilityState.expanded` không tới được trình đọc màn hình (khối đã ẩn) — nó phản
 * chiếu ĐÍCH gập/mở thật (đã tính "Giảm chuyển động") để test kiểm được HÀNH VI mà không phải đọc style của Reanimated.
 * ⚠️ `memo`: màn Đăng nhập vẽ lại MỖI ký tự gõ (`form.watch`) — sách chỉ cần vẽ lại khi cờ của provider hay cỡ màn đổi.
 */
export const AuthHero = memo(function AuthHero() {
  const { closed, hasError } = useAuthHero();
  const { isLandscape } = useBreakpoint();
  const geometry = bookGeometry(isLandscape);
  const { open, progress, shake } = useBookMotion({
    closed,
    hasError,
    shakeDistance: geometry.shake,
  });
  // Màn bị che (đã sang Đăng ký, app xuống nền) ⇒ quầng thôi trôi, sao thôi nhấp nháy — vẫn vẽ, chỉ đứng yên.
  const focused = useIsScreenFocused();

  const width = geometry.boardW * 2;
  const height = geometry.boardH + geometry.inset * 2;

  return (
    <Reveal className="items-center" kind="zoom">
      {/* "Sân khấu" rộng hết cột form, bo `rounded-lg`, TRÀN 12dp trên/dưới khung sách mà không chiếm chỗ bố cục ⇒ khe
          `gap-xl` tới tiêu đề giữ nguyên. Gốc `GlowOrbs` tự `overflow-hidden` ⇒ quầng bị cắt gọn trong sân khấu, không
          loang xuống form. ⛔ Đặt TRƯỚC sách (anh em vẽ sau nằm trên). */}
      <GlowOrbs active={focused} className="-inset-y-3 rounded-lg" />
      <View
        accessibilityElementsHidden
        accessibilityState={{ expanded: open }}
        className="items-center justify-center"
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={{ height, width }}
        testID="auth-hero"
      >
        {open ? <HeroSparkles active={focused} compact={isLandscape} geometry={geometry} /> : null}
        <AuthBook compact={isLandscape} geometry={geometry} progress={progress} shake={shake} />
      </View>
    </Reveal>
  );
});

/**
 * Bốn ngôi sao lấp lánh quanh sách ĐANG MỞ ("mở sách ra là có điều hay"); sách gập (ô mật khẩu) ⇒ tháo, mờ đi nhanh.
 * ⛔ Vẽ TRƯỚC sách (nằm DƯỚI): sao đã đặt ngoài mép sách, lỡ lệch vài dp cũng không bao giờ che nội dung trang.
 * ✅ "Giảm chuyển động": sách luôn mở ⇒ sao luôn có mặt, ĐỨNG YÊN (`Sparkles` tự dừng nhịp), không mờ vào/ra.
 */
function HeroSparkles({
  active,
  compact,
  geometry,
}: {
  active: boolean;
  compact: boolean;
  geometry: BookGeometry;
}) {
  const reduceMotion = useReducedMotion();
  const x = geometry.boardW * SPARKLE_BLEED.x;
  const y = geometry.boardW * SPARKLE_BLEED.y;

  return (
    // `cssInterop={false}`: không có `className` — chỉ khung tĩnh + hoạt ảnh vào/ra, đi thẳng tới Reanimated.
    <Animated.View
      cssInterop={false}
      entering={reduceMotion ? undefined : SPARKLES_IN}
      exiting={reduceMotion ? undefined : SPARKLES_OUT}
      style={{ bottom: -y, left: -x, position: 'absolute', right: -x, top: -y }}
      testID="auth-hero-sparkles"
    >
      <Sparkles active={active} count={4} size={compact ? 8 : 12} tone="action-accent" />
    </Animated.View>
  );
}
