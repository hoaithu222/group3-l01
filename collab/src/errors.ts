/**
 * Lý do từ chối/đóng kết nối gửi về client (chuỗi ổn định — CHỐT trong README §Giao thức, client dựa vào đây):
 *
 * | reason                 | Ý nghĩa                                                   | Client nên                                  |
 * | ---------------------- | --------------------------------------------------------- | ------------------------------------------- |
 * | `unauthorized`         | token thiếu/sai chữ ký/hết hạn/không khớp document        | xin token mới rồi nối lại                   |
 * | `forbidden`            | không (còn) quyền vào tài nguyên này                      | dừng, thoát màn hình                        |
 * | `not-found`            | tài nguyên không tồn tại / loại không được phục vụ        | dừng                                        |
 * | `too-many-connections` | vượt giới hạn kết nối/tài nguyên hoặc/người                | thử lại sau                                 |
 * | `unavailable`          | BE không phản hồi (không thể kiểm quyền)                  | thử lại có backoff                          |
 * | `revoked`              | quyền vừa bị thu hồi/đổi — nối lại để xác thực lại        | nối lại (nếu hết quyền sẽ nhận `forbidden`) |
 * | `archived`             | tài nguyên vừa được lưu trữ — nối lại ở chế độ xem        | xin token mới (mode `view`) và nối lại      |
 * | `rate-limited`         | gửi quá nhanh                                             | giảm tần suất, nối lại sau                  |
 * | `unsupported-message`  | loại message không được phép                              | lỗi client, không nối lại tự động           |
 * | `awareness-invalid`    | awareness sai định dạng/giả mạo danh tính                 | lỗi client, không nối lại tự động           |
 */
export type DenyReason =
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "too-many-connections"
  | "unavailable"
  | "rate-limited"
  | "unsupported-message"
  | "awareness-invalid";

/** Mã đóng WebSocket ứng với từng lý do (nếu server phải đóng thô socket sau khi từ chối xác thực). */
export const CLOSE_CODE: Record<DenyReason | "revoked" | "archived" | "auth-timeout", number> = {
  unauthorized: 4401,
  forbidden: 4403,
  "not-found": 4404,
  "auth-timeout": 4408,
  archived: 4409,
  "too-many-connections": 4429,
  "rate-limited": 4429,
  revoked: 4403,
  unavailable: 4503,
  "unsupported-message": 4400,
  "awareness-invalid": 4400,
};

/**
 * Ném từ `onAuthenticate`: Hocuspocus gửi `reason` cho client (sự kiện `authenticationFailed`) rồi ta tự đóng socket.
 * CỐ Ý không kế thừa `Error`/không có `message`: `Hocuspocus.hooks()` chỉ `console.error` khi lỗi có `message`,
 * mà từ chối xác thực là chuyện bình thường (token hết hạn…) — không được làm ồn stderr.
 */
export class AuthDenied {
  constructor(public readonly reason: DenyReason) {}
}

/** Ném từ `beforeHandleMessage`: `Connection.handleMessage` đóng kết nối với đúng `code`/`reason` này. */
export class MessageRejected {
  constructor(
    public readonly code: number,
    public readonly reason: DenyReason,
  ) {}
}

/** Ném từ `beforeUnloadDocument` để chặn dỡ document còn state chưa lưu (Hocuspocus nuốt lỗi và giữ document). */
export class UnloadBlocked {}

/** BE không phản hồi / trả 5xx sau khi đã thử lại. */
export class BeUnavailableError extends Error {
  constructor(
    public readonly op: string,
    detail: string,
  ) {
    super(`BE không khả dụng (${op}): ${detail}`);
  }
}

/** BE từ chối có chủ đích (4xx) — không thử lại. */
export class BeRejectedError extends Error {
  constructor(
    public readonly op: string,
    public readonly status: number,
    public readonly code: string | undefined,
  ) {
    super(`BE từ chối (${op}): HTTP ${status}${code ? ` ${code}` : ""}`);
  }
}
