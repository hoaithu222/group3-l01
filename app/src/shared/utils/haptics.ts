import * as Haptics from 'expo-haptics';

/**
 * Rung phản hồi DÙNG CHUNG — bốn nhịp, chọn theo NGHĨA của thao tác chứ không theo cảm giác "cho vui tay".
 *
 * | Hàm                 | Khi nào                                                                        |
 * | ------------------- | ------------------------------------------------------------------------------ |
 * | `hapticTap()`       | xác nhận cú chạm của hành động CHÍNH (gửi, bắt đầu, ghim, thả tim)             |
 * | `hapticSelection()` | đổi lựa chọn trong một nhóm (tab/chip/bộ lọc, bật-tắt công tắc, chọn đáp án)   |
 * | `hapticSuccess()`   | việc dài vừa XONG và thành công (lưu, nộp bài, hoàn thành phiên)               |
 * | `hapticWarning()`   | thao tác bị chặn/cần chú ý (sai mã, chưa đủ điều kiện) — ⛔ không cho lỗi mạng |
 *
 * ⛔ Đừng rung ở MỌI cú chạm (hàng danh sách, nút quay lại, mở màn): rung dày là nhiễu, người dùng tắt rung cả máy.
 * ⚠️ Gọi TRƯỚC việc có thể trễ (`router.push`, `mutate`): rung là phản hồi tức thì của cú chạm, không phải của kết quả.
 *
 * Theo cài đặt rung của hệ điều hành (tắt rung/không có động cơ rung là không rung). Lỗi nuốt IM LẶNG — cả lỗi ĐỒNG BỘ (`try`,
 * hằng số thiếu ở bản mock/nền tảng lạ) lẫn bất đồng bộ (`catch`): phản hồi phụ không được làm hỏng hành động chính.
 */
function fire(run: () => Promise<void>): void {
  try {
    run().catch(() => undefined);
  } catch {
    // Rung là phụ — nuốt im lặng (xem JSDoc ở trên).
  }
}

export function hapticTap(): void {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

export function hapticSelection(): void {
  fire(() => Haptics.selectionAsync());
}

export function hapticSuccess(): void {
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

export function hapticWarning(): void {
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}
