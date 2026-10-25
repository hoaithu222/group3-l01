import { type ReactNode } from 'react';
import { View } from 'react-native';

import { useBreakpoint } from '@/shared/theme';

import { ConversationListScreen } from './ConversationListScreen';

export interface MessagesSplitLayoutProps {
  /** Ngăn xếp route của tab (`<Stack/>` ở `messages/_layout.tsx`) — luôn là khung PHẢI. */
  children: ReactNode;
}

/**
 * Bố cục HAI CỘT của tab "Tin nhắn" trên máy tính bảng (app.md p1-05 §3, cuối
 * bảng): danh sách hội thoại bên trái, route đang mở (chat · info · members ·
 * new…) bên phải. Điện thoại (< `tablet`, 600dp) không đổi gì — chỉ trả `children`.
 *
 * ── Vì sao `useBreakpoint()` chứ không phải class `tablet:` ──────────────────
 * `responsive.md` §2 ưu tiên class, nhưng ở đây là RẼ NHÁNH NỘI DUNG (cột trái
 * chứa cả một màn có query/socket riêng): che bằng `hidden tablet:flex` vẫn MOUNT
 * danh sách trên điện thoại, tức hai `useConversationList` chạy song song và
 * request thừa cho mọi người dùng điện thoại.
 *
 * ── ⚠️ Vị trí của `children` KHÔNG ĐƯỢC đổi giữa hai bố cục ──────────────────
 * Cột trái đứng ở khe 0 (`null` khi điện thoại), khung phải luôn ở khe 1, nên
 * React giữ nguyên `<Stack/>` khi xoay máy/kéo chia đôi màn hình qua ngưỡng 600dp.
 * Bọc `children` vào cây khác nhau theo bậc là remount navigator, mất sạch ngăn
 * xếp đang mở.
 *
 * Bề rộng cột trái `w-2/5` kẹp 280–360dp: 360 đúng đặc tả ở máy ≥ 900dp, còn máy
 * 600dp thì khung phải vẫn còn ≥ 320dp thay vì bị bóp còn 240.
 */
export function MessagesSplitLayout({ children }: MessagesSplitLayoutProps) {
  const { isTablet } = useBreakpoint();

  return (
    <View className="flex-1 flex-row">
      {isTablet ? (
        <View className="w-2/5 min-w-[280px] max-w-[360px] border-r-hairline border-border-1">
          <ConversationListScreen />
        </View>
      ) : null}
      <View className="flex-1">{children}</View>
    </View>
  );
}
