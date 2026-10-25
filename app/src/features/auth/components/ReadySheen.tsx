import { useState } from 'react';
import { View } from 'react-native';

import { ShimmerSweep } from '@/shared/ui';

/**
 * Ánh quét MỘT lượt trên nút gửi mỗi lần form VỪA đủ để gửi (`ready`: `false` → `true`) — tín hiệu "xong rồi, bấm được"
 * đúng lúc ký tự cần thiết cuối cùng vào ô. Đặt làm con CUỐI của lớp bọc cùng cỡ, cùng bo góc với nút:
 *
 * ```tsx
 * <View className="flex-1 overflow-hidden rounded-full">
 *   <Button label="Đăng nhập" pressableClassName="self-stretch" onPress={submit} />
 *   <ReadySheen ready={filled} />
 * </View>
 * ```
 *
 * ── Phát lại bằng `key` ─────────────────────────────────────────────────────────────────────────────────────────────
 * `ShimmerSweep` quét MỘT lần lúc gắn vào cây rồi nằm yên ngoài mép (vô hình). Mỗi sườn lên của `ready` tăng `lap` ⇒ `key`
 * đổi ⇒ React dựng lại lớp quét ⇒ quét lượt mới. Rời trạng thái đủ (xoá một ô) KHÔNG tháo lớp quét: lượt đang dở chạy nốt
 * thay vì tắt phụt giữa chừng. Lượt 0 (vừa vào màn, form trống) không vẽ gì — chưa có gì để "mời bấm".
 *
 * ⛔ Không ăn cú chạm (`pointerEvents="none"` ở lớp này lẫn trong `ShimmerSweep`), ẩn khỏi trình đọc màn hình: nút bên
 * dưới vẫn là thứ DUY NHẤT nhận chạm và được đọc. ✅ "Giảm chuyển động" ⇒ không quét (`useLoopProgress` lo sẵn).
 * ⚠️ Ánh trắng mặc định chỉ hợp nền ĐẬM/tông (nút `primary`) — đặt lên nút nền sáng thì gần như vô hình.
 */
export function ReadySheen({ ready }: { ready: boolean }) {
  // "Điều chỉnh state ngay lúc vẽ" — mẫu React khuyên dùng để nhớ giá trị của lần vẽ trước, khỏi thêm effect + một lượt
  // commit thừa. Chỉ SƯỜN LÊN mới tính là một lượt mới.
  const [wasReady, setWasReady] = useState(ready);
  const [lap, setLap] = useState(0);
  if (ready !== wasReady) {
    setWasReady(ready);
    if (ready) setLap((count) => count + 1);
  }

  if (lap === 0) return null;

  return (
    <View
      accessibilityElementsHidden
      className="absolute inset-0"
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      testID="ready-sheen"
    >
      <ShimmerSweep key={lap} className="rounded-full" />
    </View>
  );
}
