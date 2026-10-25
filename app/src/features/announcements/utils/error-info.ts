import { isAxiosError } from 'axios';

import { getErrorCode, toErrorMessage } from '@/core/api/client.helpers';

/**
 * Nhãn lỗi của feature — bảng mã chung của app (`shared/constants/error-codes.ts`) chưa có `ANN_*`, và feature này chủ động
 * tắt toast của interceptor (`skipErrorToast`) nên tự hiện. Mã khác rơi về `toErrorMessage` (mất mạng, hết giờ, 5xx…).
 */
const ANNOUNCEMENT_ERROR_LABELS: Record<string, string> = {
  ANN_001: 'Chỉ kênh thông báo mới yêu cầu xác nhận đã đọc',
  ANN_002: 'Kênh đang có quá nhiều thông báo cần xác nhận',
  ANN_003: 'Yêu cầu xác nhận đã bị huỷ hoặc hết hạn',
  CH_004: 'Kênh đã được lưu trữ, không thể thay đổi',
};

export interface AnnouncementErrorInfo {
  code?: string;
  message: string;
  /** `ANN_003` (410): yêu cầu đã huỷ/hết hạn — nơi gọi phải đóng vòng (khoá nút, làm mới danh sách). */
  gone: boolean;
  /** 403/404: mất quyền xem danh sách hoặc yêu cầu không còn — màn danh sách quay lại. */
  noAccess: boolean;
}

export function describeAnnouncementError(error: unknown): AnnouncementErrorInfo {
  if (!isAxiosError(error)) return { gone: false, message: toErrorMessage(error), noAccess: false };

  const status = error.response?.status;
  const code = getErrorCode(error);
  return {
    code,
    gone: code === 'ANN_003' || status === 410,
    message: ANNOUNCEMENT_ERROR_LABELS[code] ?? toErrorMessage(error),
    noAccess: status === 403 || status === 404,
  };
}
