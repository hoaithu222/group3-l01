import * as Haptics from 'expo-haptics';

/**
 * Rung NHẸ khi bấm hành động chính ("Ôn ngay", "Học thẻ") — xác nhận cú chạm đã ăn, không phải để gây chú ý. Theo cài đặt rung của
 * hệ điều hành (tắt rung là không rung); lỗi (máy không có động cơ rung) nuốt im lặng — không được làm hỏng hành động chính.
 * ⚠️ Gọi TRƯỚC `router.push`: rung là phản hồi tức thì, điều hướng có thể trễ một nhịp khi màn đích còn đang nạp.
 */
export function lightTap(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}
