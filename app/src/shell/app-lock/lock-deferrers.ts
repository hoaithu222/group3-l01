/**
 * Sổ đăng ký "đừng khoá ngay bây giờ" — cho các phân hệ đang có việc KHÔNG được
 * phép bị lớp phủ khoá cắt ngang giữa chừng (vd p2-02: đang trong một cuộc gọi).
 *
 * ⛔ Registry đơn giản (`Map`), KHÔNG phải store Zustand: đây là bài học từ
 * `vci-sun-mobile` (`useDirectCallStore`) — dùng store nghĩa là mọi phân hệ
 * muốn hoãn khoá phải BIẾT VỀ NHAU qua cùng một slice, trong khi
 * `docs/rules/feature-structure.md` cấm feature import chéo feature. Registry
 * theo `id` thì `p2-02` (hay bất kỳ phân hệ tương lai nào) tự đăng ký/gỡ đăng ký
 * mà `shell/app-lock` không cần biết nó là ai.
 */

type DeferCheck = () => boolean;

const deferrers = new Map<string, DeferCheck>();

/**
 * Đăng ký một điều kiện hoãn khoá. Trả về hàm HUỶ đăng ký — gọi ở effect cleanup
 * của phân hệ đó, nếu không thì phân hệ đã unmount vẫn "giữ" khoá mãi mãi.
 *
 * @example
 *   useEffect(() => registerLockDeferrer('call', () => isCallActive), [isCallActive]);
 */
export function registerLockDeferrer(id: string, check: DeferCheck): () => void {
  deferrers.set(id, check);
  return () => {
    deferrers.delete(id);
  };
}

/**
 * Có ÍT NHẤT một deferrer đang xin hoãn không.
 *
 * ⛔ Một deferrer lỗi (ném exception) không được phép chặn toàn bộ cơ chế khoá
 * của app — coi như deferrer đó trả `false` và tiếp tục hỏi các deferrer khác.
 */
export function shouldDeferLock(): boolean {
  for (const check of deferrers.values()) {
    try {
      if (check()) return true;
    } catch {
      // Bỏ qua deferrer hỏng — xem chú thích trên.
    }
  }
  return false;
}

/** CHỈ dùng trong test: đưa registry về trạng thái sạch giữa các ca kiểm. */
export function __resetLockDeferrersForTests(): void {
  deferrers.clear();
}
