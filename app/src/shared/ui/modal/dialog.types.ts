/**
 * Kiểu dùng chung của nhóm `modal`.
 *
 * ⛔ Tách ra file riêng vì `Dialog` và `DialogIcon` cùng cần `DialogVariant`; để
 * nó ở `Dialog.tsx` thì `DialogIcon` phải nhập ngược lên component cha và thành
 * một vòng nhập — thứ ESLint chặn cứng (`import/no-cycle`) và trên React Native
 * hiện ra lúc CHẠY dưới dạng `undefined is not a function`.
 */

/**
 * Tông của `Dialog`, lấy đúng 4 ca trong ghi chú thiết kế của section "Modals"
 * (`259:96083`) cộng ca thứ 5 vẽ trong bản thiết kế ("Time remaining").
 */
export type DialogVariant = 'default' | 'success' | 'warning' | 'error' | 'loading';

/**
 * Một nút hành động của hộp thoại.
 *
 * ⚠️ Nhận DỮ LIỆU chứ không nhận `ReactNode`: hai nút của hộp thoại phải chia
 * đôi bề ngang và cùng cỡ, nên hình thức do `Dialog` quyết. Nơi gọi truyền
 * `ReactNode` thì mỗi màn hình lại ra một dáng nút khác nhau.
 */
export interface DialogActionProps {
  disabled?: boolean;
  label: string;
  /** Khoá nút và thay nhãn bằng vòng quay — dùng khi nút gửi một yêu cầu mạng. */
  loading?: boolean;
  onPress: () => void;
}
