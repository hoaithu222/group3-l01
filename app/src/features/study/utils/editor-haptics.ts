import * as Haptics from 'expo-haptics';

/**
 * Rung phản hồi của trình soạn/tạo bộ. Rung chỉ xác nhận cú chạm đã ăn — không mang thông tin, nên: theo cài đặt rung của hệ
 * điều hành, và MỌI lỗi (máy không có động cơ rung, module vắng trong Jest) bị nuốt: không được làm hỏng thao tác chính.
 * `try` bọc cả lời gọi đồng bộ vì một bản mock thiếu hàm sẽ ném ngay, không trả Promise.
 */
function safely(run: () => Promise<void> | void): void {
  try {
    Promise.resolve(run()).catch(() => undefined);
  } catch {
    // Không có động cơ rung / module vắng — bỏ qua có chủ ý.
  }
}

/** Nhẹ: thêm mục, chọn dạng, đánh dấu đáp án. */
export function hapticTap(): void {
  safely(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Đậm hơn một nấc: lưu thành công. */
export function hapticSaved(): void {
  safely(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}
