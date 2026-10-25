/**
 * Chính sách xử lý lý do từ chối/đóng kết nối của collab (README `collab/` §3.4) — hàm THUẦN, không I/O.
 * Nguồn: `onAuthenticationFailed({ reason })`, tin CLOSE trong luồng (`onClose` với `event.reason`, code 1000) và đóng socket thô (mã 44xx/1009).
 * Provider tự nối lại ~1 s sau MỌI lần đóng nên với mỗi hành động `stop`/`refresh-token`/`backoff` manager phải `disconnect()` ngay.
 */
import type { EditorErrorCode } from "./bridge-protocol";

export type CloseAction =
  /** Lỗi mạng thường (1000/1001/1006…): provider tự nối lại, không làm gì. */
  | { kind: "ignore" }
  /** Dừng hẳn (không nối lại) và báo lỗi cho app. */
  | { kind: "stop"; code: EditorErrorCode; message: string; detail: string }
  /** Token bị từ chối: dừng nối, xin token mới qua bridge rồi nối lại (tối đa vài lần liên tiếp). */
  | { kind: "refresh-token" }
  /** Quá tải/tạm không khả dụng: dừng nối tự động của provider, tự nối lại sau backoff mũ. */
  | { kind: "backoff"; detail: string }
  /** Quyền/trạng thái vừa đổi — để provider nối lại để xác thực lại (nếu hết quyền sẽ nhận `forbidden`). */
  | { kind: "reconnect"; archived: boolean; detail: string };

export interface CloseInfo {
  /** `reason` của server (`unauthorized`, `forbidden`, …) hoặc chuỗi tuỳ ý của provider. */
  reason?: string | undefined;
  /** Mã đóng WebSocket (1000 cho tin CLOSE trong luồng). */
  code?: number | undefined;
}

const stop = (code: EditorErrorCode, message: string, detail: string): CloseAction => ({ kind: "stop", code, message, detail });

const BY_REASON: Record<string, CloseAction> = {
  unauthorized: { kind: "refresh-token" },
  forbidden: stop("FORBIDDEN", "Bạn không còn quyền truy cập tài liệu này", "forbidden"),
  "not-found": stop("NOT_FOUND", "Tài liệu không tồn tại", "not-found"),
  "too-many-connections": { kind: "backoff", detail: "too-many-connections" },
  "rate-limited": { kind: "backoff", detail: "rate-limited" },
  unavailable: { kind: "backoff", detail: "unavailable" },
  revoked: { kind: "reconnect", archived: false, detail: "revoked" },
  archived: { kind: "reconnect", archived: true, detail: "archived" },
  "auth-timeout": { kind: "reconnect", archived: false, detail: "auth-timeout" },
  "unsupported-message": stop("LOAD_FAILED", "Không đồng bộ được tài liệu (lỗi ứng dụng)", "unsupported-message"),
  "awareness-invalid": stop("LOAD_FAILED", "Không đồng bộ được tài liệu (lỗi ứng dụng)", "awareness-invalid"),
};

const BY_CODE: Record<number, CloseAction> = {
  4400: stop("LOAD_FAILED", "Không đồng bộ được tài liệu (lỗi ứng dụng)", "client-error"),
  4401: { kind: "refresh-token" },
  // 4403 = `forbidden` HOẶC `revoked` (cùng mã, khác `reason`): thiếu `reason` thì nối lại để xác thực lại — lần xác thực sau báo `forbidden` rõ ràng.
  4403: { kind: "reconnect", archived: false, detail: "4403" },
  4404: stop("NOT_FOUND", "Tài liệu không tồn tại", "not-found"),
  4408: { kind: "reconnect", archived: false, detail: "auth-timeout" },
  4409: { kind: "reconnect", archived: true, detail: "archived" },
  4429: { kind: "backoff", detail: "4429" },
  4503: { kind: "backoff", detail: "unavailable" },
  // Khung WebSocket > 6 MiB: nối lại sẽ lặp vô hạn (mỗi lần SyncStep2 lại quá lớn).
  1009: stop("TOO_LARGE", "Tài liệu quá lớn để đồng bộ", "frame-too-large"),
};

export function decideOnClose(info: CloseInfo): CloseAction {
  const reason = info.reason?.trim().toLowerCase();
  const byReason = reason ? BY_REASON[reason] : undefined;
  if (byReason) return byReason;
  const byCode = info.code === undefined ? undefined : BY_CODE[info.code];
  return byCode ?? { kind: "ignore" };
}

/** Trễ nối lại (ms) lần thứ `attempt` (1, 2, …): 2 s, 4 s, 8 s… tối đa 30 s, cộng nhiễu ≤ 20% để các máy không dồn cùng lúc. */
export function backoffDelayMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(30_000, 2_000 * 2 ** Math.max(0, attempt - 1));
  return Math.round(base + base * 0.2 * random());
}
