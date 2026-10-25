/**
 * Nén log lặp: cùng một `key` chỉ được ghi tối đa một lần / `intervalMs`; lần ghi kế tiếp kèm số lần đã nén
 * (`suppressed`). Dùng cho lỗi lặp theo chu kỳ (cron, dịch vụ phụ trợ chưa chạy) — số đếm đầy đủ nằm ở metric,
 * log chỉ cần báo "đang lỗi" thay vì lặp lại mỗi lượt.
 */
export interface LogThrottle {
  /** `null` = đã ghi trong cửa sổ, bỏ qua; ngược lại được ghi, kèm số lần đã nén kể từ lần ghi trước. */
  tryAcquire(key: string): { suppressed: number } | null;
  /** Nguồn lỗi đã hồi phục: xoá trạng thái để lỗi kế tiếp được ghi ngay. `true` nếu trước đó `key` đang bị theo dõi. */
  clear(key: string): boolean;
}

export function createLogThrottle(intervalMs: number, now: () => number = () => Date.now()): LogThrottle {
  const state = new Map<string, { at: number; suppressed: number }>();
  return {
    tryAcquire(key) {
      const at = now();
      const last = state.get(key);
      if (last && at - last.at < intervalMs) {
        last.suppressed += 1;
        return null;
      }
      state.set(key, { at, suppressed: 0 });
      return { suppressed: last?.suppressed ?? 0 };
    },
    clear(key) {
      return state.delete(key);
    },
  };
}
