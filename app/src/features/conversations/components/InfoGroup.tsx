import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Card } from '@/shared/ui/card';

/**
 * Thẻ bao một nhóm `InfoActionRow` ở màn Thông tin hội thoại — cùng khuôn `MeNavGroup` của màn Tôi (bản riêng của `conversations`,
 * ⛔ không import chéo feature `me`). Trước đây các hàng nằm trần trên nền màn, cách nhau bằng khe trống: không có mốc nào cho mắt
 * biết đâu là một nhóm.
 *
 * ⚠️ Vỏ `overflow-hidden` + con `-mb-px`: MỌI hàng đều mang `divider` (hàng ẩn/hiện theo quyền nên nơi gọi không biết hàng nào đứng
 * cuối) ⇒ lề âm kéo vỏ ngắn đi 1dp và vỏ CẮT vạch kẻ thừa dưới hàng CUỐI — thẻ không kết thúc bằng một đường kẻ.
 * `padded={false}` + `px-md py-2xs`: mỗi hàng đã tự có `py-xs`; để `p-md` mặc định thì ô icon đầu cách mép thẻ 24dp.
 */
export function InfoGroup({ children }: { children: ReactNode }) {
  return (
    <Card className="px-md py-2xs" padded={false}>
      <View className="overflow-hidden">
        <View className="-mb-px">{children}</View>
      </View>
    </Card>
  );
}
