import { isAxiosError } from 'axios';

import { extractErrorCode, extractErrorDetails } from '@/core/api/error.handler';
import { formatNumber } from '@/shared/utils/format';

/** Mã lỗi BE (`error.code`) của một lỗi axios; `''` khi không phải lỗi axios / không có mã. */
export function errorCodeOf(err: unknown): string {
  if (!isAxiosError(err)) return '';
  const code = extractErrorCode(err);
  return code === 'UNKNOWN' ? '' : code;
}

export const errorStatusOf = (err: unknown): number | undefined =>
  isAxiosError(err) ? err.response?.status : undefined;

/** `RES_003` — bản ghi đã bị sửa ở nơi khác (CAS `expectedVersion` lệch) → phải tải lại trước khi lưu. */
export const isVersionConflict = (err: unknown): boolean => errorCodeOf(err) === 'RES_003';

/**
 * BE (`idempotencyKey`) LƯU mọi phản hồi 4xx theo khoá 24 giờ, trừ 429 (giới hạn tốc độ) và 5xx (lỗi tạm thời); riêng `RES_004`
 * ("yêu cầu trùng đang xử lý") là lần gửi TRƯỚC còn chạy nên phải giữ khoá để không cộng hai lần. Gửi lại nội dung đã sửa bằng khoá cũ sẽ
 * nhận lại đúng lỗi cũ ⇒ sau kết luận 4xx phải ĐỔI khoá; lỗi mạng / 5xx thì GIỮ khoá (BE trả lại kết quả đã có thay vì làm hai lần).
 */
export function shouldRotateIdempotencyKey(err: unknown): boolean {
  const status = errorStatusOf(err);
  if (status === undefined || status < 400 || status >= 500 || status === 429) return false;
  return errorCodeOf(err) !== 'RES_004';
}

/** `error.details` của BE dạng bản đồ (`VAL_001` = `flatten().fieldErrors` của Zod) hoặc `null`. */
function detailsMap(err: unknown): Record<string, unknown> | null {
  if (!isAxiosError(err)) return null;
  const details = extractErrorDetails(err);
  return details !== null && typeof details === 'object' && !Array.isArray(details)
    ? (details as Record<string, unknown>)
    : null;
}

/** Thông điệp ĐẦU TIÊN của mỗi trường trong `error.details` (bỏ giá trị không phải chuỗi). */
export function serverFieldMessages(err: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(detailsMap(err) ?? {})) {
    const first: unknown = Array.isArray(raw) ? raw[0] : raw;
    if (typeof first === 'string' && first.trim() !== '') out[key] = first.trim();
  }
  return out;
}

function detailNumber(err: unknown, key: string): number | null {
  const value = detailsMap(err)?.[key];
  return typeof value === 'number' ? value : null;
}

/**
 * Câu lỗi gắn vào ô SỐ XU của form điều chỉnh, hoặc `null` nếu lỗi này không nói về số xu:
 * `COIN_001` (trừ quá số dư — `details { balance, required }`), `COIN_009` (vượt mức tối đa — `details { max }`), `VAL_001` có `details.amount`.
 */
export function adjustAmountError(err: unknown): string | null {
  const code = errorCodeOf(err);
  if (code === 'COIN_001') {
    const balance = detailNumber(err, 'balance');
    return balance === null
      ? 'Không đủ xu để trừ'
      : `Số dư hiện tại chỉ còn ${formatNumber(balance)} xu — không thể trừ nhiều hơn`;
  }
  if (code === 'COIN_009') {
    const max = detailNumber(err, 'max');
    return max === null
      ? 'Số dư sau điều chỉnh vượt mức tối đa cho phép'
      : `Số dư sau điều chỉnh vượt mức tối đa ${formatNumber(max)} xu`;
  }
  return serverFieldMessages(err).amount ?? null;
}
