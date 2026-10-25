import { Pressable } from 'react-native';

import { Icon } from '@/shared/ui/icon';

/**
 * Nút đóng của `Alert`.
 *
 * ⚠️ Vẫn tách hẳn ra file riêng: `Icon` gọi `useThemeColors` bên trong, nên đặt
 * thẳng vào `Alert` thì MỌI alert đều vẽ lại mỗi lần người dùng đổi theme — kể
 * cả alert không có nút đóng, tức là phần lớn.
 *
 * ✅ Dấu ✕ nay lấy từ bộ icon chung (`cancel` — ✕ trong vòng tròn, đúng
 * `icon_ht_cancel` của Figma và cùng icon `SheetHeader` đang dùng). Bản tự vẽ
 * bằng `react-native-svg` đã bỏ: `src/shared/ui/AGENTS.md` cấm tự vẽ `<Path>`
 * vì lần xuất icon sau không đi qua nó, và nét sẽ lệch dần với các màn khác.
 */
export function AlertCloseButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel="Đóng thông báo"
      accessibilityRole="button"
      className="size-xl items-center justify-center"
      /**
       * Hình vẽ 20dp trong ô 24dp — dưới ngưỡng chạm 44dp mà cả Apple lẫn Google
       * khuyến nghị. `hitSlop={12}` nới vùng chạm lên 48dp mà không phóng to dấu
       * ✕. Thiếu nó thì người dùng bấm hai ba lần mới trúng, và họ đổ lỗi cho app
       * chứ không cho ngón tay mình.
       */
      hitSlop={12}
      onPress={onPress}
    >
      {/* ⛔ `fg-3` trên nền `surface-*` ở chế độ sáng chỉ đo được 2.47–2.66:1 —
        dưới ngưỡng 3:1 của THÀNH PHẦN KHÔNG PHẢI CHỮ, tức nút đóng gần như tan
        vào hộp. `fg-2` cho 4.80–5.17:1 (sáng) và 7.56–8.65:1 (tối). Chế độ
        tối vốn đã đạt (4.14–4.74:1) nên đây thuần là vá chế độ sáng. */}
      <Icon color="fg-2" name="cancel" size="sm" />
    </Pressable>
  );
}
