import { isAxiosError } from 'axios';
import type { AxiosError } from 'axios';

import {
  ERROR_CODE_MESSAGES,
  HTTP_STATUS_MESSAGES,
  NETWORK_ERROR_MESSAGE,
  TIMEOUT_ERROR_MESSAGE,
  UNKNOWN_ERROR_MESSAGE,
} from '@/shared/constants/error-codes';

import type { ApiErrorBody } from './client.types';

/**
 * Lấy câu thông báo cho người dùng từ phản hồi lỗi.
 *
 * ── Nguyên tắc: câu của BACKEND thắng ────────────────────────────────────────
 * Backend biết ngữ cảnh, ta thì không. "Mã hợp đồng CT-2026-001 đã tồn tại"
 * hữu ích hơn hẳn "Yêu cầu không hợp lệ". Chỉ khi backend KHÔNG trả câu nào mới
 * rơi xuống bảng tra theo mã HTTP.
 *
 * Các dạng payload được đọc, theo thứ tự ưu tiên (mọi dạng dưới đây đều đã gặp
 * thật ở các backend nội bộ — đừng cắt bớt nhánh nào mà không kiểm tra lại):
 *
 *   1. Có cấu trúc   : `{ error: { code, message } }`
 *   2. Phẳng .NET    : `{ Message: "..." }`          ← viết hoa chữ đầu
 *   3. Phẳng thường  : `{ message: "..." }`
 *   4. Gateway .NET  : `{ status: false, errorCode: "MA_LOI" }`
 *   5. ProblemDetails: `{ errors: { field: ["..."] } }`
 *   6. ProblemDetails: `{ title: "..." }`
 *   7. Bảng tra theo mã HTTP
 */
export function getErrorMessage(
  status: number | undefined,
  body: ApiErrorBody | undefined,
  fallback: string = UNKNOWN_ERROR_MESSAGE,
): string {
  // 1. Có cấu trúc — mã lỗi được ưu tiên hơn câu, vì bảng của ta đã dịch sẵn.
  const structuredCode = body?.error?.code;
  if (structuredCode) {
    const mapped = ERROR_CODE_MESSAGES[structuredCode];
    if (mapped) return mapped;
  }
  const structuredMessage = body?.error?.message;
  if (structuredMessage) {
    return ERROR_CODE_MESSAGES[structuredMessage] ?? structuredMessage;
  }

  // 2 & 3. Dạng phẳng. Backend đôi khi nhét MÃ LỖI vào trường `message`, nên
  // vẫn tra bảng trước rồi mới lấy nguyên văn.
  const flat = body?.Message ?? body?.message;
  if (typeof flat === 'string' && flat.trim()) {
    return ERROR_CODE_MESSAGES[flat.trim()] ?? flat.trim();
  }

  // 4. Gateway .NET.
  const code = body?.errorCode ?? body?.ErrorCode;
  if (typeof code === 'string' && code) {
    return ERROR_CODE_MESSAGES[code] ?? code;
  }

  // 5. Lỗi kiểm dữ liệu theo từng trường — lấy câu ĐẦU TIÊN.
  // Hiện cả cụm trên một toast ở màn hình điện thoại thì tràn mất, và người
  // dùng cũng chỉ sửa được từng trường một.
  if (body?.errors && typeof body.errors === 'object') {
    for (const messages of Object.values(body.errors)) {
      if (Array.isArray(messages) && typeof messages[0] === 'string') return messages[0];
    }
  }

  // 6. ProblemDetails.
  if (typeof body?.title === 'string' && body.title.trim()) return body.title.trim();

  // 7. Đường lui theo mã HTTP.
  if (status !== undefined && HTTP_STATUS_MESSAGES[status]) return HTTP_STATUS_MESSAGES[status];

  return fallback;
}

/**
 * Câu thông báo cho một `AxiosError` bất kỳ, kể cả khi không có phản hồi.
 *
 * ⛔ Phần "không có phản hồi" là phần QUAN TRỌNG NHẤT trên di động và là chỗ mà
 * code chép từ web hay bỏ sót. Trên web, mất mạng là ca hiếm; trên điện thoại
 * đó là ca THƯỜNG XUYÊN NHẤT — thang máy, hầm xe, công trường, tàu điện. Không
 * xử lý riêng thì người dùng nhận câu "Request failed with status code
 * undefined" giữa một giao diện tiếng Việt.
 */
export function getApiErrorMessage(error: AxiosError): string {
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return TIMEOUT_ERROR_MESSAGE;
  // `ERR_NETWORK` là mã axios dùng khi request không tới được máy chủ.
  if (!error.response || error.code === 'ERR_NETWORK') return NETWORK_ERROR_MESSAGE;

  // ⛔ Mã HTTP ngoài bảng (405, 418…) rơi về câu chung mặc định — KHÔNG được lộ `error.message` của
  // axios ("Request failed with status code 418": chi tiết kỹ thuật, tiếng Anh, giữa giao diện Việt).
  return getErrorMessage(error.response.status, error.response.data as ApiErrorBody | undefined);
}

/**
 * Câu thông báo cho một lỗi BẤT KỲ — kể cả thứ không phải `AxiosError`.
 *
 * Dùng ở tầng React Query, nơi `mutation.error` có kiểu `Error` chứ không phải
 * `AxiosError`: một lỗi ném ra từ `onSuccess`, một `TypeError` do code sai, hay
 * một chuỗi ai đó `throw` cũng rơi vào đây. Không có hàm này thì mỗi màn hình
 * tự ép kiểu `as AxiosError` — và ép sai thì đọc `error.response` trên một
 * `TypeError` sẽ ném lỗi mới NGAY TRONG lúc đang hiển thị lỗi cũ.
 */
export function toErrorMessage(error: unknown): string {
  if (isAxiosError(error)) return getApiErrorMessage(error);
  if (error instanceof Error && error.message) return error.message;
  return UNKNOWN_ERROR_MESSAGE;
}

/** Mã lỗi nghiệp vụ của backend, `'UNKNOWN'` khi không đọc được. */
export function getErrorCode(error: AxiosError): string {
  const body = error.response?.data as ApiErrorBody | undefined;
  return body?.error?.code ?? body?.errorCode ?? body?.ErrorCode ?? 'UNKNOWN';
}

/**
 * Lỗi đã được interceptor toast rồi hay chưa.
 *
 * Dùng trong `onError` của React Query để không toast trùng — chỉ hiện thêm khi
 * interceptor chưa xử lý (vd request có `skipErrorToast: true`).
 */
export function isErrorHandled(error: unknown): boolean {
  return Boolean((error as { __toastShown?: boolean } | null | undefined)?.__toastShown);
}

/** Tên trường bị che khi ghi log. So khớp KHÔNG phân biệt hoa/thường. */
const SECRET_KEYS =
  /pass|secret|token|authorization|credential|otp|pin|cvv|signature|apikey|api_key/i;

/**
 * Che giá trị nhạy cảm trước khi in ra console.
 *
 * ⛔ Bắt buộc: log của Metro hiện trên màn hình máy dev, thường đang chia sẻ
 * trong buổi họp hoặc đang quay video demo. Body của lượt đăng nhập chứa MẬT
 * KHẨU THẬT của người đang thử. Đã có nhiều sự cố lộ mật khẩu đúng theo đường này.
 *
 * Đệ quy vào cả object lồng và mảng — mật khẩu hay nằm trong `{ payload: { ... } }`.
 */
export function redactSecrets(value: unknown, depth = 0): unknown {
  // Chặn độ sâu: cấu trúc tự tham chiếu (response có vòng) sẽ làm đệ quy vô tận,
  // và một lời gọi log KHÔNG được phép làm chết app.
  if (depth > 6) return '[quá sâu]';
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, depth + 1));

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = SECRET_KEYS.test(key) ? '***' : redactSecrets(item, depth + 1);
  }
  return output;
}
