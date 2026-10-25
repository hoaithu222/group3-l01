import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';

/**
 * ⛔ Object thật, KHÔNG dùng `StyleSheet.absoluteFill`: cái đó là một style ĐÃ
 * ĐĂNG KÝ (thực chất là một con số). Ghép chung mảng với một animated style thì
 * Reanimated không đọc ra được các khoá bên trong nó.
 */
const ABSOLUTE_FILL = { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 } as const;

/** Figma: chấm thường 4dp, chấm đang chọn 12dp ⇒ dài gấp ba. */
const ACTIVE_WIDTH_RATIO = 3;

/** Đủ để mắt thấy là "dài ra", chưa đủ để người dùng phải chờ nó xong. */
const DURATION_MS = 200;

interface SliderDotItemProps {
  active: boolean;
  /** Nhãn đọc cho trình đọc màn hình, dạng "Trang 2 trên 5". */
  label: string;
  onPress?: () => void;
  size: number;
}

/**
 * Một chấm của `SliderDot`.
 *
 * Tách thành file riêng vì mỗi chấm cần hook hoạt ảnh RIÊNG, mà gọi hook trong
 * `.map()` là vi phạm Rules of Hooks — không viết thẳng trong component cha được.
 *
 * ── Vì sao Reanimated chứ không phải `Animated` của React Native ─────────────
 * Chấm đang chọn DÀI RA (4 → 12dp), tức là đổi BỀ RỘNG THẬT trong bố cục.
 * `Animated` của RN không làm được ca này:
 *  · `useNativeDriver: true` chỉ nhận `opacity` và `transform` — đưa `width`
 *    vào là ném lỗi ngay lúc chạy;
 *  · `useNativeDriver: false` thì hoạt ảnh chạy trên luồng JS, mà đúng lúc đổi
 *    trang thì luồng JS đang bận xử lý cú vuốt ⇒ giật đúng lúc người dùng nhìn;
 *  · `transform: scaleX` chạy được với native driver nhưng KHÔNG đổi kích thước
 *    trong bố cục — ô vẫn rộng 12dp, nên khoảng cách giữa các chấm sai hết.
 * Reanimated ghi thẳng vào cây bố cục trên luồng UI nên `width` mượt kể cả khi
 * JS đang kẹt. (Reanimated 4 chỉ chạy trên New Architecture — SDK 57 bật sẵn.)
 *
 * ⚠️ Màu KHÔNG nội suy bằng mã hex mà bằng hai lớp chồng nhau, chỉ đổi
 * `opacity`. Nhờ vậy màu vẫn khai bằng token trong `className` — đổi bảng màu
 * hay đổi theme không phải sửa file này — và `opacity` là thứ chạy rẻ nhất.
 */
export function SliderDotItem({ active, label, onPress, size }: SliderDotItemProps) {
  const shape = useAnimatedStyle(
    () => ({
      /**
       * ⛔ `height` phải nằm TRONG animated style, đừng để nó ở style tĩnh bên
       * ngoài (`style={[{ height: size }, shape]}`). Reanimated GHI ĐÈ prop
       * `style` của node trên luồng UI bằng đúng object mà worklet trả về —
       * khoá nào worklet không trả thì bị bỏ. Chấm mất `height`, còn lại
       * `height: auto`, và vì hàng chấm là `flex-row` nên mỗi chấm KÉO GIÃN
       * hết chiều cao vùng cuộn: ba vệt dọc chạy suốt màn hình, đẩy toàn bộ nội
       * dung dưới nó ra ngoài. ⚠️ Bề rộng vẫn đúng nên nhìn class không ra lỗi.
       */
      height: size,
      width: withTiming(active ? size * ACTIVE_WIDTH_RATIO : size, { duration: DURATION_MS }),
    }),
    [active, size],
  );

  const fill = useAnimatedStyle(
    () => ({ opacity: withTiming(active ? 1 : 0, { duration: DURATION_MS }) }),
    [active],
  );

  // `rounded-full` cho cả hai lớp: ô 4×4 thành hình tròn, ô 12×4 thành viên
  // thuốc — đúng `cornerRadius: 9999` của Figma, không cần tính bán kính theo cỡ.
  //
  // Hai lớp mang hai VAI TRÒ màu khác nhau, đừng gom về một họ:
  //  · lớp dưới `indicator-muted` — chấm mờ, cùng họ màu thương hiệu nhưng
  //    tương phản NGƯỢC chiều với chấm đang chọn ở mỗi chế độ (#B8D0CE ở sáng,
  //    #26564C ở tối);
  //  · lớp trên là bề mặt ĐẶC mang màu thương hiệu ⇒ phải `action-base`.
  //    ⛔ Đừng thay bằng `primary-6`: thang SỐ giống hệt nhau ở hai chế độ, nên
  //    ở chế độ tối chấm đang chọn chỉ hơn chấm mờ 1.58:1 — cả hàng nhìn như
  //    nhau và người dùng mất dấu mình đang ở trang nào.
  // ✅ Cặp đang dùng đo được **6.76:1 ở chế độ sáng · 4.28:1 ở chế độ tối** —
  //    cả hai trên ngưỡng 3:1 của hình phi văn bản. Con số chế độ tối chỉ đúng
  //    vì `indicator-muted` ở đó là #26564C; ⛔ đổi token đó là phải đo lại.
  const mark = (
    <Animated.View style={shape}>
      <View className="absolute inset-0 rounded-full bg-indicator-muted" />
      <Animated.View cssInterop={false} style={[ABSOLUTE_FILL, fill]}>
        <View className="h-full w-full rounded-full bg-action-base" />
      </Animated.View>
    </Animated.View>
  );

  if (!onPress) return mark;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      /**
       * ⚠️ Chấm chỉ 4dp — không cách nào chạm tới ngưỡng 44dp theo chiều NGANG
       * mà không ăn sang vùng của chấm bên cạnh (Figma để chúng cách nhau đúng
       * 4dp). Nên: nới hết cỡ theo chiều DỌC (4 + 20×2 = 44dp), còn chiều ngang
       * chỉ lấy nửa khoảng hở mỗi bên để hai vùng chạm không chồng lên nhau —
       * chồng nhau thì người dùng bấm chấm 3 lại nhảy sang trang 4, tệ hơn hẳn
       * việc bấm trượt.
       * ⇒ Bấm chấm là đường TẮT, vuốt vẫn phải là thao tác chính của carousel.
       */
      hitSlop={{ bottom: 20, left: size / 2, right: size / 2, top: 20 }}
      onPress={onPress}
    >
      {mark}
    </Pressable>
  );
}
