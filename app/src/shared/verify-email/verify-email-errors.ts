import { isAxiosError } from 'axios';

import { toErrorMessage } from '@/core/api/client.helpers';
import type { ApiErrorBody } from '@/core/api/client.types';

/** Bước đang làm — cùng mã 400 nghĩa khác nhau ở "gửi mã" và "xác nhận mã". */
export type VerifyEmailStep = 'send' | 'confirm';

/** Phân loại lỗi xác minh email (BE `EmailVerificationService`). Màn hiện NGAY TRONG ô nhập mã, không toast. */
export type VerifyEmailFailure =
  /** Email ĐÃ được xác minh (xác minh ở nơi khác giữa chừng) — coi như xong, màn cha đi tiếp. */
  | { kind: 'ALREADY_VERIFIED' }
  /** Mã sai hoặc hết hạn (15 phút). */
  | { kind: 'BAD_CODE' }
  | { kind: 'OTHER'; message: string };

/**
 * BE trả `ValidationError` (400, `VAL_001`) cho CẢ "Email đã được xác minh" lẫn "Mã xác minh không hợp lệ hoặc đã hết hạn" — và bảng mã chung
 * dịch `VAL_001` thành câu chung chung "Dữ liệu đầu vào không hợp lệ" nên phải tự đọc câu gốc của BE để phân biệt.
 *   · `send` chỉ có MỘT lý do 400 (đã xác minh) — không có thân yêu cầu để sai.
 *   · `confirm` 400: câu gốc nói "đã được xác minh" ⇒ đã xác minh; còn lại ⇒ mã sai/hết hạn.
 * 429 (`RATE_002`: gửi quá 3 lần/15 phút, hoặc khoá tạm vì nhập sai nhiều lần) đi vào `OTHER` với câu của bảng mã chung.
 *
 * Nằm ở `shared/` (không phải `features/members`) vì hai nơi dùng chung luồng này: chấp nhận lời mời email (`members`, `INV_008`
 * `EMAIL_NOT_VERIFIED`) và "Xác minh email" độc lập ở Cài đặt → Bảo mật (`me`) — hai feature không được import chéo nhau.
 */
export function classifyVerifyEmailError(
  error: unknown,
  step: VerifyEmailStep,
): VerifyEmailFailure {
  const status = isAxiosError(error) ? error.response?.status : undefined;
  if (status === 400) {
    if (step === 'send') return { kind: 'ALREADY_VERIFIED' };
    const raw = isAxiosError(error)
      ? (error.response?.data as ApiErrorBody | undefined)?.error?.message
      : undefined;
    return typeof raw === 'string' && raw.includes('đã được xác minh')
      ? { kind: 'ALREADY_VERIFIED' }
      : { kind: 'BAD_CODE' };
  }
  return { kind: 'OTHER', message: toErrorMessage(error) };
}

export const BAD_CODE_MESSAGE =
  'Mã không đúng hoặc đã hết hạn (mã có hiệu lực 15 phút). Kiểm tra lại hoặc gửi mã mới.';
