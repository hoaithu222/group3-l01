import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { BadgeAnchor } from '@/shared/ui/badge';
import { Button, type ButtonVariant } from '@/shared/ui/button';
import type { IconName } from '@/shared/ui/icon';

interface RoomControlBaseProps {
  /** Câu trình đọc màn hình nói — đầy đủ hơn nhãn ngắn dưới nút ("Tắt micro" so với "Tắt mic"), và mang cả nghĩa của huy hiệu. */
  accessibilityLabel: string;
  /** Huy hiệu góc TRÊN-PHẢI (số người, tin chưa đọc). */
  badge?: ReactNode;
  /** Huy hiệu góc TRÊN-TRÁI (người đang chờ ở phòng chờ). */
  badgeLeft?: ReactNode;
  /** Đang xử lý (xin quyền, chờ track bật/tắt): nút hiện vòng quay, bề rộng giữ nguyên. */
  busy?: boolean;
  disabled?: boolean;
  /** Nhãn CHỮ ngắn dưới nút — luôn có: trạng thái không được chỉ dựa vào màu/icon. */
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
}

/**
 * Hình trong nút: `icon` (bộ icon BIDV) HOẶC `glyph` — hình là CHỮ (emoji ✋ của `HandGlyph`: bộ icon chưa có bàn tay). Union rời để
 * `tsc` chặn nút không hình / hai hình cùng lúc.
 */
export type RoomControlProps = RoomControlBaseProps & ({ glyph?: never; icon: IconName } | { glyph: ReactNode; icon?: never });

/** Huy hiệu chỉ trang trí: nghĩa của nó đã nằm trong `accessibilityLabel` của nút, để riêng thì trình đọc màn hình đọc thêm một ô "3" vô nghĩa. */
const hidden = (node: ReactNode): ReactNode =>
  node ? (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {node}
    </View>
  ) : undefined;

/**
 * Một ô của thanh điều khiển phòng họp: nút tròn 48dp + nhãn CHỮ dưới nút.
 *
 * ⚠️ Viết cục bộ vì `CallControl` (cùng dáng) nằm trong feature `calls` — nhập vào là import chéo feature (cấm); bộ `shared/ui` chưa có
 * "nút icon + nhãn dưới" (`Button iconOnly` chỉ có icon). Phần nút vẫn là `Button` chung, đây chỉ là khung xếp nhãn + huy hiệu.
 * `glyph` đi qua `children` của `Button` (khe CHỮ của nút): emoji là chữ, nên nó nhận đúng trạng thái nhấn/khoá/bận của `Button` thay
 * vì một nút tự dựng lệch bản vẽ; `w-12 px-0` giữ nút vuông tròn 48dp như nút chỉ-icon.
 *
 * ✅ Ô CO GIÃN (`flex-1`, 48–80dp) để SÁU ô nằm MỘT hàng từ máy 360dp; nhãn tối đa 2 dòng nên máy 320dp / chữ hệ thống 130% vẫn đọc đủ
 * (không cắt "Cảm x…"). Nằm ngang: thanh là cột bên phải, mỗi ô chiếm nửa cột (lưới 2 cột).
 * ⚠️ Mặc định `white-secondary` (viền + icon TRẮNG): thanh nằm trên nền `ink-10` cố định ở cả hai theme, mà các biến thể `neutral-*` lấy
 * màu THEO THEME (chế độ sáng ra icon đen trên nền đen). Trạng thái bật = `white` đặc; tắt/cảnh báo = `danger-secondary`.
 */
export function RoomControl({
  accessibilityLabel,
  badge,
  badgeLeft,
  busy = false,
  disabled = false,
  glyph,
  icon,
  label,
  onPress,
  variant = 'white-secondary',
}: RoomControlProps) {
  return (
    <View className="min-w-12 max-w-20 flex-1 items-center gap-3xs landscape:w-1/2 landscape:flex-none">
      <BadgeAnchor badge={hidden(badge)}>
        <BadgeAnchor badge={hidden(badgeLeft)} placement="top-left">
          {icon ? (
            <Button accessibilityLabel={accessibilityLabel} disabled={disabled} iconLeft={icon} iconOnly loading={busy} variant={variant} onPress={onPress} />
          ) : (
            <Button accessibilityLabel={accessibilityLabel} className="w-12 px-0" disabled={disabled} loading={busy} variant={variant} onPress={onPress}>
              {glyph}
            </Button>
          )}
        </BadgeAnchor>
      </BadgeAnchor>
      <Text className="text-center text-caption-sm text-fg-on-nav-muted" maxFontSizeMultiplier={1.3} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}
