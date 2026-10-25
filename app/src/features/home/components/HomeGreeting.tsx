import { Text, View } from 'react-native';

import { useIsScreenFocused } from '@/shared/hooks/useIsScreenFocused';
import { Avatar } from '@/shared/ui/avatar';
import { GlowOrbs } from '@/shared/ui/effects';
import { formatLongDate } from '@/shared/utils/format/date.utils';
import { useAuthStore } from '@/shell/store/slices/auth';

import { getGreeting, getGreetingScene } from '../utils/greeting.utils';

import { GreetingIllustration } from './GreetingIllustration';

/**
 * Lời chào đầu Trang chủ — khối HERO: bên trái là chữ (overline ngày hôm nay, lời chào THEO BUỔI, rồi TÊN cỡ `header-md` —
 * điểm nhấn chữ duy nhất của khối); bên phải là cảnh trời theo giờ (`GreetingIllustration`: mặt trời/mây/trăng/sao) với
 * ảnh đại diện đè lên góc dưới-phải của cảnh.
 *
 * ── Nền ─────────────────────────────────────────────────────────────────────
 * `GlowOrbs` phía sau CẢ khối, trong vùng `overflow-hidden rounded-md` có đệm `p-md` — quầng có chỗ trôi mà không dí sát chữ.
 * ⚠️ Đây là vòng lặp NỔI BẬT DUY NHẤT của Trang chủ: thẻ hero, ô lưới, khe thống kê đều tĩnh — ⛔ đừng thêm `BorderBeam` /
 * `ShimmerSweep loop` ở màn này. `active` = màn đang THẬT SỰ hiện (`useIsScreenFocused`): sang tab khác thì quầng đứng yên.
 * ⛔ Đừng quay lại thẻ gradient `nav-from → nav-to`: đó là cặp màu của THANH TAB dưới — lặp ở đầu màn là hai dải đậm kẹp
 * nội dung, và một thẻ đậm ngay dưới `AppBar` trông như thanh tiêu đề THỨ HAI. Màn chỉ có MỘT tiêu đề ("Trang chủ" ở
 * `AppBar`); khối này nói "ai" và "hôm nay", không lặp tên màn.
 * ✅ Chữ dùng `fg-1`/`fg-2`: vùng KHÔNG có nền riêng (quầng nằm thẳng trên nền màn) nên token vai trò tự đúng ở hai chế độ;
 * quầng ở chế độ sáng chỉ LÀM SÁNG (xem `GlowOrbs`) nên `fg-2` vẫn đạt AA.
 *
 * Không có `onPress`: chạm ảnh đại diện để sang hồ sơ là việc của tab Tôi — không thêm lối vào thứ hai tới cùng một chỗ.
 * `accessible` gộp ba dòng thành MỘT câu đọc ("Chào buổi sáng, An. Thứ Hai…") thay vì ba lần vuốt; cảnh minh hoạ và quầng
 * là trang trí (ẩn) nên không chen vào câu đó.
 *
 * Buổi/cảnh tính theo giờ lúc VẼ (không đếm giờ chạy nền): Trang chủ vẽ lại mỗi lần kéo làm mới, đủ cho một lời chào.
 */
export function HomeGreeting() {
  const user = useAuthStore((state) => state.user);
  const focused = useIsScreenFocused();
  const now = new Date();
  const hour = now.getHours();
  const greeting = getGreeting(hour);
  const name = user?.name ?? 'Bạn';
  const date = formatLongDate(now);

  return (
    <View className="overflow-hidden rounded-md">
      <GlowOrbs active={focused} />
      <View
        accessibilityLabel={`${greeting}, ${name}. ${date}`}
        accessible
        className="flex-row items-center gap-md p-md"
      >
        {/* ⛔ `flex-1` ở cột chữ + `numberOfLines`: tên dài (tiếng Việt 4–5 từ) không được đẩy cảnh + ảnh ra khỏi hàng. */}
        <View className="flex-1 gap-3xs">
          <Text className="text-overline text-fg-2" numberOfLines={1}>
            {date}
          </Text>
          <Text className="text-body-lg text-fg-2">{greeting}</Text>
          <Text className="text-header-md font-semibold text-fg-1" numberOfLines={1}>
            {name}
          </Text>
        </View>
        {/* Khung 80 = cảnh 72 + 8 cho ảnh đại diện thò ra góc: phần thò nằm TRONG bố cục (không dùng `-bottom-*`) nên đệm
            dưới của khối không bị ăn mất. Vòng nền quanh ảnh tách ảnh khỏi hình vẽ phía sau. */}
        <View className="h-20 w-20">
          <GreetingIllustration active={focused} scene={getGreetingScene(hour)} />
          <View className="absolute bottom-0 right-0 rounded-full bg-bg-1 p-3xs">
            <Avatar name={user?.name} size="md" />
          </View>
        </View>
      </View>
    </View>
  );
}
