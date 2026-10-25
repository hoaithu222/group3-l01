import { isAxiosError } from 'axios';

import { toErrorMessage } from '@/core/api/client.helpers';
import type { ApiErrorBody } from '@/core/api/client.types';

/**
 * Câu tiếng Việt cho mã `RECR_*` (be.md p6-08 §8; `be/src/core/utils/error.codes.ts`) — đặt TRONG feature, cùng cách `career-errors.ts`/
 * `mentor.constants.ts` (không nhét thêm vào bảng chung `shared/constants/error-codes.ts` đang ở trần dòng). Interceptor vẫn rơi về `message`
 * tiếng Việt của BE khi toast chung. Sinh viên chỉ gặp phần lớn ở nhóm `002/007/008/009`; các mã còn lại là của HR/vận hành nhưng vẫn khai để
 * không rơi về câu HTTP chung vô nghĩa (một sinh viên cũng có thể đăng ký doanh nghiệp từ web).
 */
export const RECRUITER_ERROR_MESSAGES: Record<string, string> = {
  RECR_001: 'Bạn đã thuộc một doanh nghiệp',
  RECR_002: 'Doanh nghiệp đang tạm ngưng hoặc chưa được duyệt nên chưa thực hiện được thao tác này',
  RECR_003: 'Chỉ chủ sở hữu doanh nghiệp được thực hiện thao tác này',
  RECR_004: 'Doanh nghiệp với tên hoặc mã số thuế này đã được đăng ký',
  RECR_005: 'Doanh nghiệp đã dùng hết lượt gửi lời mời trong tháng',
  RECR_006: 'Đã có lời mời đang mở với ứng viên này',
  RECR_007: 'Không thể gửi lời mời cho ứng viên này',
  RECR_008: 'Chỉ trao đổi được sau khi bạn bấm Quan tâm — hoặc cuộc trao đổi đã đóng',
  RECR_009: 'Lời mời đã thay đổi trạng thái, không thực hiện được thao tác này nữa',
  RECR_010: 'Đã đạt giới hạn xem hồ sơ ứng viên trong ngày',
  RECR_011: 'Người dùng này đã thuộc doanh nghiệp khác',
  RECR_012: 'Không thể xoá chủ sở hữu cuối cùng của doanh nghiệp',
};

function bodyOf(error: unknown): ApiErrorBody | undefined {
  return isAxiosError(error) ? (error.response?.data as ApiErrorBody | undefined) : undefined;
}

/** Mã lỗi BE (`RECR_009`…) — chỗ UI RẼ NHÁNH theo mã. */
export function recruiterErrorCode(error: unknown): string | null {
  return bodyOf(error)?.error?.code ?? null;
}

function httpStatusOf(error: unknown): number | null {
  return isAxiosError(error) ? (error.response?.status ?? null) : null;
}

/** Câu tiếng Việt: ưu tiên nhãn `RECR_*` của feature, còn lại dùng bộ dịch chung (mạng, 5xx, `VAL_001`…). */
export function recruiterErrorMessage(error: unknown): string {
  const code = recruiterErrorCode(error);
  return (code && RECRUITER_ERROR_MESSAGES[code]) || toErrorMessage(error);
}

/** Lời mời đổi trạng thái giữa chừng (hai thiết bị, doanh nghiệp thu hồi) — màn làm mới rồi báo "Lời mời đã thay đổi". */
export const isOfferChanged = (error: unknown): boolean => recruiterErrorCode(error) === 'RECR_009';

/** Thread đóng (chưa Quan tâm, bị khoá, doanh nghiệp tạm ngưng) — ô soạn đổi thành "Cuộc trao đổi đã đóng". */
export const isThreadClosed = (error: unknown): boolean => recruiterErrorCode(error) === 'RECR_008';

/** 404 (lời mời không còn, bị ẩn danh hoá, cờ tắt `CFG_005`) — màn hiện "Lời mời không còn", không phải lỗi mạng. */
export function isOfferGone(error: unknown): boolean {
  return httpStatusOf(error) === 404 || recruiterErrorCode(error) === 'CFG_005';
}

/** Lỗi KẾT NỐI (không có phản hồi từ server) — tin trong thread được thử gửi lại khi có mạng, khác với bị server từ chối. */
export function isNetworkFailure(error: unknown): boolean {
  return isAxiosError(error) && !error.response;
}
