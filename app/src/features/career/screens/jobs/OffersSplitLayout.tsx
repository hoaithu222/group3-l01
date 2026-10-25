import { type ReactNode } from 'react';
import { View } from 'react-native';

import { useBreakpoint } from '@/shared/theme';

import { OfferInboxScreen } from './OfferInboxScreen';

export interface OffersSplitLayoutProps {
  /** Ngăn xếp route của nhánh (`<Stack/>` ở `offers/_layout.tsx`) — luôn là khung PHẢI. */
  children: ReactNode;
}

/**
 * Bố cục HAI CỘT của "Lời mời" trên máy tính bảng (app.md §7 "hộp thư + chi tiết chia 2 cột"): hộp thư bên trái, route đang mở (chi tiết · trao đổi) bên phải.
 * Điện thoại (< `tablet`, 600dp) không đổi gì — chỉ trả `children`. Cùng khuôn `MessagesSplitLayout` của tab Tin nhắn.
 *
 * ── `useBreakpoint()` chứ không phải class `tablet:` ────────────────────────
 * Đây là RẼ NHÁNH NỘI DUNG (cột trái chứa cả một màn có query/socket riêng): che bằng `hidden tablet:flex` vẫn MOUNT hộp thư trên điện thoại,
 * tức hai `useMyOffers` chạy song song và request thừa cho mọi người dùng điện thoại.
 *
 * ── ⚠️ Vị trí của `children` KHÔNG ĐƯỢC đổi giữa hai bố cục ─────────────────
 * Cột trái ở khe 0 (`null` khi điện thoại), khung phải luôn ở khe 1 — React giữ nguyên `<Stack/>` khi xoay máy/kéo chia đôi màn hình qua ngưỡng 600dp.
 * Bọc `children` vào cây khác nhau theo bậc là remount navigator, mất sạch ngăn xếp đang mở.
 */
export function OffersSplitLayout({ children }: OffersSplitLayoutProps) {
  const { isTablet } = useBreakpoint();

  return (
    <View className="flex-1 flex-row">
      {isTablet ? (
        <View className="w-2/5 min-w-[280px] max-w-[360px] border-r-hairline border-border-1">
          <OfferInboxScreen />
        </View>
      ) : null}
      <View className="flex-1">{children}</View>
    </View>
  );
}
