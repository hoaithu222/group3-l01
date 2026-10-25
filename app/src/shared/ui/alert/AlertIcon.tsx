import { type ReactNode } from 'react';
import { View } from 'react-native';

import { type ThemeColorKey } from '@/shared/theme';
import { Icon, type IconName } from '@/shared/ui/icon';

import { alert, type AlertTone } from './alert.styles';

/**
 * Khung biểu tượng 24dp đứng đầu `Alert` — kèm hình MẶC ĐỊNH theo tông.
 *
 * ⛔ Icon ở đây không phải trang trí. Design Note của section Alert (Figma
 * 259:93563) định nghĩa intent BẰNG icon, nguyên văn: "Icon xanh: thông báo
 * thành công… · Icon màu primary: thông tin hoặc gợi ý… · Icon cam: khi cần
 * cảnh báo… · Icon đỏ: khi luồng hiện tại bị chặn… · **Không có icon**: khi cần
 * giải thích hoặc nêu định nghĩa về luồng". Tức là `Intent=None` được định
 * nghĩa chính bằng việc VẮNG icon, còn bốn tông kia luôn có một icon 24dp.
 *
 * Thêm nữa `src/shared/ui/AGENTS.md` bắt buộc tông `warning` "luôn kèm biểu
 * tượng": màu `warning` chỉ đo được 4.06:1 trên nền trắng và 3.61:1 trên
 * `surface-warning` — dưới ngưỡng AA — nên MÀU không được phép là dấu hiệu duy
 * nhất. Khi `icon` chưa có mặc định thì trách nhiệm đó rơi vào từng nơi gọi, và
 * thực tế đo được trong repo là 0/8 nơi gọi truyền icon.
 *
 * ⚠️ Tách hẳn ra file riêng vì `Icon` gọi `useThemeColors()` bên trong: đặt
 * thẳng vào `Alert` thì MỌI alert vẽ lại mỗi lần người dùng đổi theme. Cùng lý
 * do `AlertCloseButton` đã tách.
 *
 * ⚠️ Bốn icon dưới đây là dạng NÉT RỖNG một màu, còn Figma vẽ tròn ĐẶC + nét
 * trắng (giống `ToastIcon`). Trong `assets/icons/system/` chỉ `checkmark-circle`
 * có biến thể `.solid`, ba cái kia không — trộn hai kiểu thì bốn tông trông
 * không cùng một họ. Chọn nét rỗng cho đồng bộ; khi thiết kế bổ sung `.solid`
 * cho ba icon còn lại thì sửa ĐÚNG bảng này là xong.
 */
const TONE_ICON: Record<AlertTone, { color: ThemeColorKey; name: IconName } | null> = {
  success: { color: 'success', name: 'checkmark-circle' },
  // Tông `info` của Figma là TEAL (xem `alert.styles.ts`), nên màu icon là
  // `fg-brand`. Dùng token `info` ở đây là kéo lại đúng cái hộp xanh dương
  // không tồn tại trong bản vẽ.
  info: { color: 'fg-brand', name: 'alert-information' },
  warning: { color: 'warning', name: 'alert-warning' },
  error: { color: 'error', name: 'alert-warning-circle' },
  // `Intent=None` (259:93722): cố ý KHÔNG có icon. Đây là thứ DUY NHẤT tách
  // `brand` khỏi `info` — hai tông có màu trùng khít nhau.
  brand: null,
};

export interface AlertIconProps {
  /**
   * Hình do nơi gọi truyền vào.
   *  · bỏ trống (`undefined`) → lấy hình mặc định của tông;
   *  · `null` → cố ý KHÔNG vẽ icon nào, kể cả khi tông có hình mặc định;
   *  · phần tử → ghi đè hình mặc định.
   */
  icon?: ReactNode;
  tone: AlertTone;
}

export function AlertIcon({ icon, tone }: AlertIconProps) {
  const fallback = TONE_ICON[tone];
  // ⚠️ So với `undefined` chứ không phải kiểm "có giá trị": `icon={null}` là
  // cách nơi gọi TẮT icon mặc định, nên nó phải khác với "không truyền gì".
  const content =
    icon === undefined
      ? // ⚠️ Không truyền `label`: icon đứng cạnh chữ đã nói rõ nghĩa; đọc thêm
        // tên icon là bắt người dùng TalkBack nghe hai lần cùng một thông tin.
        fallback && <Icon color={fallback.color} name={fallback.name} size="md" />
      : icon;

  // Không có gì để vẽ thì KHÔNG dựng khung: `gap` bỏ qua phần tử không tồn tại,
  // nhưng một `<View>` rỗng vẫn chiếm đủ 24dp và đẩy chữ lệch khỏi bản vẽ.
  if (!content) return null;

  return <View className={alert().icon()}>{content}</View>;
}
