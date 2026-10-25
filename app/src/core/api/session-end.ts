/**
 * Sổ đăng ký "PHIÊN VỪA KẾT THÚC" — điểm nối duy nhất để dọn dữ liệu người dùng.
 *
 * ── Vì sao có file này ───────────────────────────────────────────────────────
 * Phiên chết theo BỐN đường: người dùng bấm đăng xuất, refresh trả 401/403,
 * request ăn 401 mà không cứu được, socket bị từ chối ở handshake. Ba đường
 * sau KHÔNG đi qua `useLogout`, nên trước đây store chat/gọi/thi thử/… của
 * người cũ nằm nguyên cho người kế tiếp trên cùng máy. Cả bốn đường đều kết
 * thúc ở `purgeSession()`, nên đó là chỗ duy nhất đáng gắn việc dọn.
 *
 * ⛔ `core/` KHÔNG được biết feature nào — nên nó chỉ GIỮ danh sách người nghe;
 * vỏ ứng dụng (`shell/session/register-session-wipe.ts`) đăng ký hàm dọn thật.
 * Cùng mô hình `registerScopeCleanup` của `core/permission`.
 */

export interface SessionEndInfo {
  /** Id người dùng của phiên vừa chết — `null` khi chưa từng biết hồ sơ. */
  userId: string | null;
}

export type SessionEndListener = (info: SessionEndInfo) => Promise<void> | void;

const listeners = new Set<SessionEndListener>();

/** Đang có một đợt dọn chạy — nhiều lời gọi `purgeSession()` dồn dập dùng chung MỘT đợt. */
let inflight: Promise<void> | null = null;

/**
 * Trần chờ đợt dọn. `purgeSession()` nằm trên đường tới hạn của interceptor 401
 * và của nút Đăng xuất: một người nghe treo (đang ngắt cuộc gọi qua mạng…) mà
 * được chờ vô hạn thì request gốc và cả màn hình đăng nhập treo theo.
 */
const LISTENER_BUDGET_MS = 3000;

/** Đăng ký người nghe. Trả hàm huỷ đăng ký. */
export function onSessionEnded(listener: SessionEndListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Báo cho mọi người nghe rằng phiên vừa bị dọn. Không bao giờ ném lỗi: một
 * người nghe hỏng không được chặn việc đăng xuất.
 */
export function notifySessionEnded(info: SessionEndInfo): Promise<void> {
  if (inflight) return inflight;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, LISTENER_BUDGET_MS);
  });
  const run = Promise.allSettled(
    [...listeners].map(async (listener) => {
      await listener(info);
    }),
  ).then(() => undefined);

  inflight = Promise.race([run, budget]).finally(() => {
    clearTimeout(timer);
    inflight = null;
  });
  return inflight;
}

/** CHỈ dùng trong test: bỏ mọi người nghe giữa các ca. */
export function __resetSessionEndListenersForTests(): void {
  listeners.clear();
  inflight = null;
}
