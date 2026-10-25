import { isAxiosError } from 'axios';

import { getErrorCode, toErrorMessage } from '@/core/api/client.helpers';
import { assetErrorMessage } from '@/core/uploads/mime';

import { RESOURCE_ERROR_MESSAGES } from '../constants/resource-error-codes.constants';

/** Mã lỗi nghiệp vụ của BE, `undefined` khi không phải lỗi HTTP/không đọc được. */
export function extractErrorCode(error: unknown): string | undefined {
  if (!isAxiosError(error)) return undefined;
  const code = getErrorCode(error);
  return code === 'UNKNOWN' ? undefined : code;
}

/**
 * Câu lỗi cho MỘT lỗi bất kỳ: ưu tiên bảng `RSC_*`, rồi câu của BE/mạng qua
 * `toErrorMessage`. Dùng cho lỗi hiện TẠI CHỖ (dưới ô tên, hộp thoại).
 */
export function resourceErrorMessage(error: unknown): string {
  const code = extractErrorCode(error);
  if (code && RESOURCE_ERROR_MESSAGES[code]) return RESOURCE_ERROR_MESSAGES[code];
  return toErrorMessage(error);
}

/**
 * Lý do hiện trên MỘT dòng của hàng đợi tải lên. `code` là `UploadItem.errorCode`
 * (`ASSET_00x`, `RSC_00x`, `UNKNOWN`, `ASSET_TIMEOUT`, hoặc `rejectReason` do BE
 * ghi cho tệp bị từ chối sau kiểm MIME thật).
 */
export function uploadFailureMessage(code: string | undefined): string {
  if (!code) return 'Không tải lên được, thử lại';
  const own = RESOURCE_ERROR_MESSAGES[code];
  if (own) return own;
  if (code === 'ASSET_TIMEOUT') return 'Tệp đang xử lý lâu hơn dự kiến, thử lại sau';
  if (code === 'UNKNOWN') return 'Không tải lên được, kiểm tra kết nối rồi thử lại';
  return assetErrorMessage(code);
}
