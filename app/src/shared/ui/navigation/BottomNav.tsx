import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cn } from '@/shared/utils/style/cn';

import { bottomNav, MIN_BOTTOM_PADDING } from './bottom-nav.styles';
import type { BottomNavItem } from './bottom-nav.types';
import { BottomNavGradient } from './BottomNavGradient';
import { BottomNavTab } from './BottomNavTab';

export type { BottomNavItem } from './bottom-nav.types';

/**
 * Thanh điều hướng dưới cùng — nền gradient xanh đậm, chữ trắng (`Type=Menu`).
 *
 * Số đo và công thức class nằm ở `bottom-nav.styles.ts`; từng mục (nhãn trợ năng, huy hiệu, chuyển động vòng sáng/icon)
 * ở `BottomNavTab.tsx`.
 *
 * ── Thuần trình bày, KHÔNG tự gọi `router` ───────────────────────────────────
 * Nơi dùng truyền `onSelect`. Nhờ vậy cùng một component dùng được cho cả
 * `<Tabs tabBar={…}>` của expo-router (nơi điều hướng do navigator quản) lẫn màn
 * hình tự quản trạng thái (ví dụ bước trong một luồng mở tài khoản). Nếu nhét
 * `router.push` vào đây thì ca thứ hai phải viết lại một thanh y hệt.
 *
 * ⛔ `insets.bottom` là bắt buộc. Trên iPhone có vạch gạt ngang, thiếu nó thì
 * hàng tab nằm ngay dưới vạch: hệ điều hành nuốt cú chạm để làm cử chỉ vuốt về
 * màn chính, và người dùng thấy "bấm tab không ăn" chứ không đoán được vì sao.
 *
 * ⛔ Icon truyền từ nơi gọi phải nhuộm bằng `fg-on-nav-accent` (đang mở) /
 * `fg-on-nav-muted` (không) để đi CÙNG CẶP với nhãn — nền thanh là màu tối ở cả
 * hai chế độ, ghép chéo sang `primary-*` là icon chìm hẳn.
 */
export function BottomNav({
  activeKey,
  className,
  contentClassName,
  items,
  onSelect,
}: {
  activeKey: string;
  /**
   * Lớp cho khối NGOÀI CÙNG — nơi có nền, dải màu và vùng an toàn.
   *
   * ⚠️ Trần bề rộng 720dp KHÔNG nằm ở đây mà ở hàng mục bên trong, nên đặt
   * `tablet:max-w-none` vào prop này là **không có tác dụng nào và cũng không
   * có lỗi nào báo**. Muốn bỏ trần thì dùng `contentClassName`.
   */
  className?: string;
  /**
   * Lớp cho HÀNG MỤC bên trong — nơi mang trần `tablet:max-w-content`.
   *
   * Đây là đường DUY NHẤT để nơi gọi bỏ trần đó:
   * `contentClassName="tablet:max-w-none"`.
   *
   * ⛔ Cố ý không gộp vào `className`: nền đặc, dải màu và đệm vùng an toàn
   * phải phủ hết bề ngang màn hình, chỉ riêng HÀNG MỤC mới bị kẹp. Gộp một
   * prop cho hai node là mọi lớp nền rơi lên cả hai.
   */
  contentClassName?: string;
  items: BottomNavItem[];
  onSelect: (key: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const base = bottomNav();


  return (
    <View
      /**
       * `tablist` gom cả hàng thành một nhóm để trình đọc màn hình đọc "tab 2
       * trên 5" — không có nó thì mỗi tab là một nút rời rạc, người dùng khiếm
       * thị không biết hàng có bao nhiêu mục.
       */
      accessibilityRole="tablist"
      className={cn(base.root(), className)}
      /**
       * ⛔ Vùng an toàn đủ BA chiều. Ai cũng nhớ `bottom` và quên `left`/`right`:
       * xoay ngang thì tai thỏ ăn vào mép trái/phải và nuốt luôn cú chạm ở đó —
       * mục tab ngoài cùng thành "bấm không ăn" mà không ai đoán ra vì sao.
       *
       * ⚠️ Đệm ở `root` làm dải màu (`absolute inset-0`) hụt vào đúng ngần ấy dp,
       * vì con `absolute` lấy mốc từ hộp ĐỆM của cha. Chấp nhận được: phần hụt
       * là rìa ngoài của một gradient TOẢ TRÒN, ở đó màu đã gần trùng `nav-to`
       * mà `root` đang đổ sẵn làm lớp lót.
       */
      style={{
        paddingBottom: Math.max(insets.bottom, MIN_BOTTOM_PADDING),
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      {/* Dải màu là TRANG TRÍ: vẽ trước để nằm DƯỚI hàng mục, không ăn cú chạm,
          và im lặng với trình đọc màn hình. ⚠️ Khai CẢ HAI prop trợ năng —
          `accessibilityElementsHidden` chỉ iOS nghe, `importantForAccessibility`
          chỉ Android nghe. */}
      <View
        accessibilityElementsHidden
        className={base.gradient()}
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
      >
        <BottomNavGradient />
      </View>

      <View className={base.row({ className: contentClassName })}>
        {items.map((item) => (
          <BottomNavTab
            key={item.key}
            item={item}
            selected={item.key === activeKey}
            onSelect={onSelect}
          />
        ))}
      </View>
    </View>
  );
}
