import * as Haptics from 'expo-haptics';

/**
 * Rung NHẸ khi chọn đáp án / chuyển câu (app.md p4-02 §7). Bỏ qua lỗi: thiết bị không có động cơ rung hay đã tắt
 * rung trong hệ điều hành không phải lý do để làm hỏng thao tác làm bài — đáp án đã ghi vào store trước khi gọi hàm này.
 * `Promise.resolve` bọc ngoài để một bản mock trả `undefined` (Jest) cũng không ném lỗi.
 */
export function tapHaptic(): void {
  Promise.resolve(Haptics.selectionAsync()).catch(() => undefined);
}
