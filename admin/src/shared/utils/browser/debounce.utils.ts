/**
 * @file debounce.utils.ts
 * @description Thay `lodash.debounce` bằng bản thuần — lodash là CJS nên
 *  không tree-shake được: chỉ cần một `import { debounce } from 'lodash'`
 *  là cả 3.1 MB thư viện bị kéo vào bundle.
 *
 *  Giữ ĐÚNG phần API mà codebase đang dùng (`.cancel()`, `.flush()`), không
 *  làm thêm: lodash còn `leading`/`trailing`/`maxWait` nhưng không nơi nào
 *  gọi tới, viết vào chỉ tăng bề mặt phải bảo trì.
 */

/** Hàm đã bọc debounce — kèm hai phép điều khiển vòng đời của lần gọi đang chờ. */
export interface DebouncedFunction<TArgs extends unknown[]> {
  (...args: TArgs): void;
  /** Huỷ lần gọi đang chờ. Bắt buộc gọi khi cleanup effect, nếu không hàm vẫn
   *  chạy sau khi component đã unmount → setState trên component đã chết. */
  cancel: () => void;
  /** Chạy NGAY lần gọi đang chờ (nếu có) thay vì đợi hết `wait`. */
  flush: () => void;
}

/**
 * Hoãn thực thi `fn` cho tới khi ngừng gọi `wait` mili-giây.
 *
 * Khác lodash ở một điểm cố ý: KHÔNG trả về giá trị của lần chạy trước.
 * Giá trị đó gần như luôn lỗi thời (thuộc về đối số cũ) và mọi chỗ gọi trong
 * repo đều bỏ qua nó, nên kiểu trả về là `void` để không ai lỡ tay dùng.
 */
export function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => unknown,
  wait = 0,
): DebouncedFunction<TArgs> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Giữ lại đối số của lần gọi gần nhất để `flush()` chạy đúng dữ liệu mới nhất.
  let pendingArgs: TArgs | undefined;

  const cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    pendingArgs = undefined;
  };

  const invoke = () => {
    const args = pendingArgs;
    // Xoá state TRƯỚC khi gọi `fn`: `fn` có thể gọi lại chính hàm debounce này
    // (vòng lặp validate → setState → validate), nếu dọn sau thì timer mới vừa
    // hẹn sẽ bị lần dọn muộn xoá mất.
    timer = undefined;
    pendingArgs = undefined;
    if (args) fn(...args);
  };

  const debounced = (...args: TArgs) => {
    pendingArgs = args;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(invoke, wait);
  };

  debounced.cancel = cancel;
  debounced.flush = () => {
    if (timer === undefined) return;
    clearTimeout(timer);
    invoke();
  };

  return debounced;
}
