import type { FailureCode } from './session-status';

/**
 * Chính sách xử lý lý do từ chối/đóng kết nối của collab (README `collab/` §3.4) — hàm THUẦN, không I/O; cùng bảng với `close-policy.ts` của
 * `editor-web` (tài liệu) nhưng câu chữ cho bảng trắng. Nguồn: `onAuthenticationFailed({ reason })`, tin CLOSE trong luồng (`onClose` với
 * `event.reason`, code 1000) và đóng socket thô (mã 44xx/1009). Provider tự nối lại ~1 s sau MỌI lần đóng nên với mỗi hành động
 * `stop`/`refresh-token`/`backoff` bộ điều khiển phải `disconnect()` ngay.
 */
export type CloseAction =
  /** Lỗi mạng thường (1000/1001/1006…): provider tự nối lại, không làm gì. */
  | { kind: 'ignore' }
  /** Dừng hẳn (không nối lại) và báo lỗi. */
  | { code: FailureCode; kind: 'stop' }
  /** Token bị từ chối: xin token mới rồi nối lại (tối đa vài lần liên tiếp). */
  | { kind: 'refresh-token' }
  /** Quá tải/tạm không khả dụng: dừng nối tự động của provider, tự nối lại sau backoff mũ. */
  | { kind: 'backoff' }
  /** Quyền/trạng thái vừa đổi — để provider nối lại để xác thực lại (nếu hết quyền sẽ nhận `forbidden`). */
  | { archived: boolean; kind: 'reconnect' };

export interface CloseInfo {
  /** Mã đóng WebSocket (1000 cho tin CLOSE trong luồng). */
  code?: number | undefined;
  /** `reason` của server (`unauthorized`, `forbidden`, …) hoặc chuỗi tuỳ ý của provider. */
  reason?: string | undefined;
}

const stop = (code: FailureCode): CloseAction => ({ code, kind: 'stop' });

const BY_REASON: Record<string, CloseAction> = {
  'auth-timeout': { archived: false, kind: 'reconnect' },
  'awareness-invalid': stop('LOAD_FAILED'),
  archived: { archived: true, kind: 'reconnect' },
  forbidden: stop('FORBIDDEN'),
  'not-found': stop('NOT_FOUND'),
  'rate-limited': { kind: 'backoff' },
  revoked: { archived: false, kind: 'reconnect' },
  'too-many-connections': { kind: 'backoff' },
  unauthorized: { kind: 'refresh-token' },
  unavailable: { kind: 'backoff' },
  'unsupported-message': stop('LOAD_FAILED'),
};

const BY_CODE: Record<number, CloseAction> = {
  // Khung WebSocket > 6 MiB: nối lại sẽ lặp vô hạn (mỗi lần SyncStep2 lại quá lớn).
  1009: stop('TOO_LARGE'),
  4400: stop('LOAD_FAILED'),
  4401: { kind: 'refresh-token' },
  // 4403 = `forbidden` HOẶC `revoked` (cùng mã, khác `reason`): thiếu `reason` thì nối lại để xác thực lại — lần xác thực sau báo `forbidden` rõ ràng.
  4403: { archived: false, kind: 'reconnect' },
  4404: stop('NOT_FOUND'),
  4408: { archived: false, kind: 'reconnect' },
  4409: { archived: true, kind: 'reconnect' },
  4429: { kind: 'backoff' },
  4503: { kind: 'backoff' },
};

export function decideOnClose(info: CloseInfo): CloseAction {
  const reason = info.reason?.trim().toLowerCase();
  const byReason = reason ? BY_REASON[reason] : undefined;
  if (byReason) return byReason;
  const byCode = info.code === undefined ? undefined : BY_CODE[info.code];
  return byCode ?? { kind: 'ignore' };
}

/** Trễ nối lại (ms) lần thứ `attempt` (1, 2, …): 2 s, 4 s, 8 s… tối đa 30 s, cộng nhiễu ≤ 20% để các máy không dồn cùng lúc. */
export function backoffDelayMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(30_000, 2_000 * 2 ** Math.max(0, attempt - 1));
  return Math.round(base + base * 0.2 * random());
}
