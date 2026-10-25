import type { AppConfig } from '@/core/config/env.config';
import { ERROR_CODE_MESSAGES, HTTP_STATUS_MESSAGES } from '@/shared/constants/error-codes';

/** Extra status messages not in centralized constants */
export const ERROR_MESSAGES: Record<number | 'network', string> = {
  ...HTTP_STATUS_MESSAGES,
  415: 'Định dạng file không được hỗ trợ. Vui lòng kiểm tra lại file upload.',
  network: 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng.',
};

/**
 * Extract error message from BE response.
 *
 * Ưu tiên message BE trả về (mọi format dưới đây); CHỈ rơi xuống fallback theo
 * HTTP status ("Yêu cầu không hợp lệ"…) khi BE KHÔNG trả message nào.
 *
 * Supports multiple BE formats (checked in priority order):
 *   1. Structured:  { error: { code: "PROJECT_ALREADY_EXISTS", message: "..." } }
 *   2. Flat key:    { Message: "PROJECT_ALREADY_EXISTS" }  ← .NET Pascal-case
 *   3. Flat lower:  { message: "PROJECT_ALREADY_EXISTS" }
 *  3b. BaseResponse:{ status:false, errorCode:"CODE", parameters:null }  ← .NET gateway
 *   4. Validation:  { errors: { field: ["msg"] } }  ← ASP.NET ProblemDetails (mọi status)
 *   5. ProblemDetails title: { title: "..." }
 *   6. HTTP status fallback
 */
export function getErrorMessage(
  status: number | undefined,
  errorData?: Record<string, unknown>,
  fallback = 'Đã xảy ra lỗi không xác định',
): string {
  // 1. Structured BE error: { error: { code, message } }
  const beError = errorData?.error as { code?: string; message?: string } | undefined;
  if (beError?.code && ERROR_CODE_MESSAGES[beError.code]) {
    return ERROR_CODE_MESSAGES[beError.code];
  }
  if (beError?.message) {
    return ERROR_CODE_MESSAGES[beError.message] ?? beError.message;
  }

  // 2 & 3. Flat key format: { Message: "..." } (.NET Pascal-case) or { message: "..." }
  const flatKey = (errorData?.Message ?? errorData?.message) as string | undefined;
  if (flatKey?.trim()) {
    const raw = flatKey.trim();
    // Known error code → mapped Vietnamese message
    if (ERROR_CODE_MESSAGES[raw]) return ERROR_CODE_MESSAGES[raw];
    // Unmapped ALL_CAPS_UNDERSCORE token = error code, not a user-facing sentence → skip
    const isUnmappedCode = /^[A-Z0-9]+(?:_[A-Z0-9]+)+$/.test(raw);
    if (!isUnmappedCode) return raw;
  }

  // 3b. .NET BaseResponse: { status: false, errorCode: "CODE", parameters: "..." }
  const errorCode = (errorData?.errorCode ?? errorData?.ErrorCode) as string | undefined;
  if (errorCode?.trim()) {
    const code = errorCode.trim();
    if (ERROR_CODE_MESSAGES[code]) return ERROR_CODE_MESSAGES[code];
    // `parameters` đôi khi chứa câu message thật → ưu tiên nếu là câu (có dấu cách)
    const params = (errorData?.parameters ?? errorData?.Parameters) as string | null | undefined;
    if (params?.trim()?.includes(' ')) return params.trim();
    // Mã chưa map & không phải dạng code → hiện thẳng; còn lại để fallback xử lý
    if (!/^[A-Z0-9]+(?:_[A-Z0-9]+)+$/.test(code)) return code;
  }

  // 4. Validation errors: { errors: { field: ["msg"] } } — mọi status (400/422…)
  const legacyErrors = errorData?.errors as Record<string, string[]> | undefined;
  if (legacyErrors) {
    const first = Object.values(legacyErrors).find((m) => m?.[0]?.trim())?.[0];
    if (first?.trim()) return first.trim();
  }

  // 5. ProblemDetails title (chỉ dùng khi khác title generic mặc định của .NET)
  const title = (errorData?.title ?? errorData?.Title) as string | undefined;
  if (
    title?.trim() &&
    !/validation error/i.test(title) // bỏ "One or more validation errors occurred."
  ) {
    return title.trim();
  }

  // 6. HTTP status fallback — chỉ tới đây khi BE KHÔNG trả message nào
  if (status && status in ERROR_MESSAGES)
    return ERROR_MESSAGES[status as keyof typeof ERROR_MESSAGES];
  if (!status) return ERROR_MESSAGES.network;
  return fallback;
}

/** Có ghi log request/response ra console không. */
export function shouldLogRequest(config: AppConfig): boolean {
  return config.enableApiLogging;
}

/**
 * Khoá của những trường KHÔNG BAO GIỜ được in ra console.
 *
 * So khớp không phân biệt hoa/thường và theo kiểu "có chứa", để bắt luôn các
 * biến thể `newPassword`, `password_confirmation`, `access_token`…
 */
const SECRET_KEYS = [
  'password',
  'token',
  'secret',
  'authorization',
  'apikey',
  'api_key',
  'otp',
  'pin',
];

/**
 * Thay giá trị nhạy cảm bằng `'[đã ẩn]'` trước khi ghi log.
 *
 * Vì sao cần: log request in nguyên `config.data`, nên `POST /auth/login` in
 * thẳng cả mật khẩu; log response in nguyên `response.data`, nên `/auth/login`
 * và `/auth/refresh` in thẳng access token. Cả kiến trúc còn lại rất kỹ về
 * việc không để token chạm ổ đĩa (`partialize` loại token khỏi persist), nên
 * để nó rơi ra console là lỗ hổng lệch hẳn phần còn lại — chỉ cần một dòng
 * `.env` bật nhầm ở staging.
 *
 * Đệ quy có GIỚI HẠN ĐỘ SÂU: payload lồng vòng (hoặc quá sâu) sẽ làm hàm log
 * treo, mà log thì không đáng để làm hỏng request.
 */
export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const lower = k.toLowerCase();
    out[k] = SECRET_KEYS.some((s) => lower.includes(s)) ? '[đã ẩn]' : redactSecrets(v, depth + 1);
  }
  return out;
}
