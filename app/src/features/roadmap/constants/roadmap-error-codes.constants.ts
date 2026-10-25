import { isAxiosError } from 'axios';

import { getErrorCode, toErrorMessage } from '@/core/api/client.helpers';

/**
 * Mã lỗi Roadmap (p4-07 be.md §8) → câu tiếng Việt, ĐÚNG NGUYÊN VĂN bảng của be.md — đồng bộ tay với
 * `be/src/core/utils/error.codes.ts` (module `roadmap` đang được dựng song song, chưa chạy được).
 *
 * Tra qua `roadmapErrorMessage()` (`utils` cục bộ ở nơi gọi) hoặc trực tiếp `ROADMAP_ERROR_MESSAGES[code]` — cùng
 * mẫu `STUDY_ERROR_MESSAGES` (`features/study/constants/study-error-codes.constants.ts`). Để ở feature theo đúng
 * quy ước "mã nghiệp vụ để ở feature tương ứng" của `file-size-manifest.json`.
 */
export const ROADMAP_ERROR_MESSAGES: Record<string, string> = {
  RMAP_001: 'Đường dẫn (slug) lộ trình đã tồn tại',
  RMAP_002: 'Nội dung bài học không hợp lệ',
  RMAP_003: 'Không xoá được tháng còn buổi học',
  RMAP_004: 'Trạng thái đăng ký lộ trình không phù hợp',
  RMAP_005: 'Lộ trình chưa có buổi nào được xuất bản',
  RMAP_006: 'Buổi học chưa mở — hoàn thành buổi trước',
  RMAP_007: 'Mục tự kiểm tra không thuộc buổi học',
  RMAP_008: 'Vượt giới hạn số lượng',
};

/**
 * ⚠️ Ngoại lệ nhỏ so với quy ước "`.constants.ts` chỉ chứa dữ liệu" (`study-error-codes.constants.ts` tách hàm
 * tra cứu sang `utils/error-info.ts`): chỉ vài nơi cần tra mã `RMAP_*` (đăng ký, hoàn thành buổi) nên không đáng
 * thêm hẳn một file util mới — gói luôn hàm tra một dòng tại đây.
 */
export function roadmapErrorMessage(error: unknown): string {
  const code = isAxiosError(error) ? getErrorCode(error) : undefined;
  return (code && ROADMAP_ERROR_MESSAGES[code]) || toErrorMessage(error);
}
