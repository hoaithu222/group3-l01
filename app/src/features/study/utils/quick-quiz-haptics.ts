import * as Haptics from 'expo-haptics';

/**
 * Rung của Quiz nhanh. Theo cài đặt rung của hệ điều hành (tắt rung là không rung); MỌI lỗi (máy không có động cơ rung, mock rỗng ở Jest) bị nuốt —
 * rung chỉ là phần thưởng cho cú chạm, không được làm hỏng việc chấm câu. Rung KHÔNG gắn với "Giảm chuyển động": đó là hai giác quan khác nhau.
 * ⚠️ Vừa bắt lỗi ĐỒNG BỘ (`try`) vừa lỗi bất đồng bộ (`catch`): `Haptics.NotificationFeedbackType` không có trong bản mock toàn cục của Jest.
 */
function fire(run: () => Promise<void>): void {
  try {
    Promise.resolve(run()).catch(() => undefined);
  } catch {
    // Bỏ qua — xem chú thích ở đầu file.
  }
}

/** Đúng: một nhịp nhẹ. */
export function correctHaptic(): void {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Sai: rung cảnh báo nhẹ (không phải rung lỗi nặng — sai ở đây là dịp học, không phải sự cố). */
export function wrongHaptic(): void {
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}

/** Xong lượt — một nhịp vừa, đúng một lần khi màn tổng kết hiện. */
export function doneHaptic(): void {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}
