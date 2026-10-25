import { isAxiosError } from 'axios';

import { errorCodeOf, httpStatusOf, toErrorMessage } from '@/shared/utils/errors';

import { O2O_ERROR_MESSAGES } from '../constants/o2o.constants';

/** Trường cấu hình mà `O2O_002` chỉ ra tiệm không hỗ trợ (`o2oErrors.unsupportedSettings(field)` ở BE). */
export type UnsupportedField = 'paper' | 'color' | 'duplex' | 'binding';

const UNSUPPORTED_MESSAGE: Record<UnsupportedField, string> = {
  paper: 'Tiệm không in được khổ A3. Hãy chọn khổ A4.',
  color: 'Tiệm không in màu. Hãy chọn in đen trắng.',
  duplex: 'Tiệm không in hai mặt. Hãy tắt in hai mặt.',
  binding: 'Tiệm không đóng gáy. Hãy tắt đóng gáy.',
};

function detailsOf(error: unknown): Record<string, unknown> {
  if (!isAxiosError(error)) return {};
  const body = error.response?.data as { error?: { details?: unknown } } | undefined;
  const details = body?.error?.details;
  return details !== null && typeof details === 'object'
    ? (details as Record<string, unknown>)
    : {};
}

/** Mã lỗi `O2O_*`/`RES_003`/`CFG_005` — chỗ UI RẼ NHÁNH theo mã (khác việc lấy câu để hiện). */
export function o2oErrorCode(error: unknown): string | undefined {
  return errorCodeOf(error);
}

/** Trường bị `O2O_002` chỉ ra; `null` khi không phải lỗi đó hoặc BE không kèm trường. */
export function unsupportedFieldOf(error: unknown): UnsupportedField | null {
  if (errorCodeOf(error) !== 'O2O_002') return null;
  const field = detailsOf(error).field;
  return field === 'paper' || field === 'color' || field === 'duplex' || field === 'binding'
    ? field
    : null;
}

/**
 * Câu tiếng Việt cho lỗi BẤT KỲ của feature: ưu tiên bảng `O2O_*` (kèm VIỆC NÊN LÀM), riêng `O2O_002` nói đúng trường tiệm không hỗ trợ;
 * còn lại rơi về bộ dịch chung (mất mạng, 5xx…). Nhận `unknown` — ⛔ đừng ép `as AxiosError` ở màn (`api-data` skill).
 */
export function o2oErrorMessage(error: unknown): string {
  const field = unsupportedFieldOf(error);
  if (field) return UNSUPPORTED_MESSAGE[field];

  const code = errorCodeOf(error);
  return (code && O2O_ERROR_MESSAGES[code]) || toErrorMessage(error);
}

/**
 * Địa điểm/đơn/tiệm không còn xem được: 404 (ẩn, không tồn tại, hoặc KHÔNG PHẢI CỦA MÌNH — BE trả 404 trung tính, IR-13) hoặc
 * cờ `o2o` tắt (`CFG_005`). Màn hiện "không còn khả dụng" chứ KHÔNG "Thử lại" — thử lại vẫn 404.
 */
export function isNotAvailable(error: unknown): boolean {
  return httpStatusOf(error) === 404 || errorCodeOf(error) === 'CFG_005';
}
