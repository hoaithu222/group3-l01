import { isAxiosError } from 'axios';

import { getErrorCode } from '@/core/api/client.helpers';

/**
 * Nhãn `CALL_POMO_*` riêng của feature — ⚠️ bảng chung `shared/constants/error-codes.ts` đã chạm trần nên nhãn nằm ở đây.
 * Khớp `be/src/core/utils/error.codes.ts`. Kèm vài mã `CALL_*` của lõi phòng thoại mà "Vào học" có thể gặp.
 */
export const POMODORO_ERROR_MESSAGES: Record<string, string> = {
  CALL_004: 'Bạn đang ở trong một cuộc gọi hoặc thiết bị khác',
  CALL_008: 'Phòng đã đủ người',
  CALL_012: 'Tính năng gọi chưa được bật — chưa vào phòng được',
  CALL_016: 'Bạn đã bị mời ra khỏi phòng này',
  CALL_018: 'Kênh hoặc nhóm đã lưu trữ, không thể vào phòng',
  CALL_POMO_001: 'Kênh này không phải phòng Pomodoro',
  CALL_POMO_002: 'Phòng đang có phiên — hãy vào học',
  CALL_POMO_003: 'Chỉ đổi cấu hình khi phiên chưa bắt đầu',
  CALL_POMO_004: 'Chỉ chủ phòng được thực hiện thao tác này',
  CALL_POMO_005: 'Thao tác không áp dụng được ở giai đoạn hiện tại',
  CALL_POMO_006: 'Hãy vào phòng trước khi đặt mục tiêu',
  RES_003: 'Phiên vừa thay đổi — đang tải lại',
  RES_004: 'Thao tác đang được xử lý, đợi một chút',
};

/** Mã lỗi từ lỗi HTTP (axios); lỗi khác → chuỗi rỗng. */
export function pomodoroErrorCode(error: unknown): string {
  return isAxiosError(error) ? getErrorCode(error) : '';
}

export function pomodoroErrorMessage(error: unknown, fallback = 'Có lỗi xảy ra, thử lại sau'): string {
  return POMODORO_ERROR_MESSAGES[pomodoroErrorCode(error)] ?? fallback;
}

/** Lệnh thua CAS (`RES_003`) hoặc sai phase (`CALL_POMO_005`): trạng thái đã đổi — tải lại chứ không báo lỗi hoảng hốt. */
export function isStaleCommand(error: unknown): boolean {
  const code = pomodoroErrorCode(error);
  return code === 'RES_003' || code === 'CALL_POMO_005';
}
