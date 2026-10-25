export interface LatestThrottle<T> {
  /** Huỷ bản đang chờ và hẹn giờ (rời màn). */
  cancel: () => void;
  /** Đẩy NGAY bản đang chờ (nếu có) — dùng trước khi rời/đóng để tin cuối không mất. */
  flush: () => void;
  push: (value: T) => void;
}

interface TimerApi {
  clear: (handle: ReturnType<typeof setTimeout>) => void;
  now: () => number;
  set: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
}

const REAL_TIMERS: TimerApi = {
  clear: (handle) => clearTimeout(handle),
  now: () => Date.now(),
  set: (fn, ms) => setTimeout(fn, ms),
};

/**
 * Giới hạn tần suất "giá trị mới nhất thắng": lần đẩy ĐẦU đi ngay (con trỏ không bị trễ thêm), các lần sau trong cùng cửa sổ `1000/hz` ms được
 * GỘP thành MỘT (giữ bản mới nhất) và đi ở cuối cửa sổ. Vì sao không debounce: người dùng kéo liên tục thì debounce không bao giờ bắn, con
 * trỏ người khác đứng im đến khi nhả tay. Vì sao không bỏ hẳn bản giữa chừng: bản CUỐI (chỗ dừng) phải tới nơi.
 * Dùng cho awareness phát đi (≤ 30 Hz, `AWARENESS.maxHz`) và cho việc nhận về (gộp vào một lần vẽ lại).
 */
export function createLatestThrottle<T>(
  fn: (value: T) => void,
  hz: number,
  timers: TimerApi = REAL_TIMERS,
): LatestThrottle<T> {
  const interval = 1000 / Math.max(1, hz);
  let last = Number.NEGATIVE_INFINITY;
  let pending: { value: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const fire = (): void => {
    if (timer) timers.clear(timer);
    timer = null;
    if (!pending) return;
    const { value } = pending;
    pending = null;
    last = timers.now();
    fn(value);
  };

  return {
    cancel: () => {
      if (timer) timers.clear(timer);
      timer = null;
      pending = null;
    },
    flush: fire,
    push: (value) => {
      pending = { value };
      const wait = last + interval - timers.now();
      if (wait <= 0) fire();
      else if (!timer) timer = timers.set(fire, wait);
    },
  };
}
