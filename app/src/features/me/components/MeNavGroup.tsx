import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Card } from '@/shared/ui/card';

/**
 * Thẻ bao một nhóm hàng (`MeNavRow`, `MeToggleRow`, hoặc hàng do feature khác đăng ký qua `ProfileRowsSlot`).
 *
 * ⚠️ Vỏ `overflow-hidden` + con `-mb-px`: MỌI hàng đều mang `divider` (kể cả hàng từ khe, nơi gọi không biết hàng nào
 * cuối) ⇒ lề âm kéo chiều cao vỏ ngắn đi 1dp và vỏ CẮT vạch kẻ thừa dưới hàng CUỐI, để thẻ không kết thúc bằng một
 * đường kẻ. Hàng tự ẩn (`BiometricSettingRow` trên máy không có cảm biến) không làm hỏng điều này: hàng nào đứng cuối
 * thì hàng đó bị cắt vạch.
 *
 * `padded={false}` + `px-md py-2xs`: đệm dọc của thẻ chỉ 4dp vì mỗi hàng đã tự có `py-xs` (8dp) — để `p-md` mặc định thì
 * ô icon đầu tiên cách mép thẻ 24dp, thẻ ba hàng cao thêm 24dp vô ích. Lề ngang 16 vẫn là của THẺ nên kẻ chia thụt vào
 * cùng lề với chữ (không chạy sát mép bo góc).
 */
export function MeNavGroup({ children }: { children: ReactNode }) {
  return (
    <Card className="px-md py-2xs" padded={false}>
      <View className="overflow-hidden">
        <View className="-mb-px">{children}</View>
      </View>
    </Card>
  );
}
