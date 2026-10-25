import { errorCodeOf, httpStatusOf, toErrorMessage } from '@/shared/utils/errors';

/**
 * Câu tiếng Việt cho mã lỗi của theo dõi sức khoẻ học tập (be.md p7-03 §8; `be/src/core/utils/error.codes.ts`) — đặt TRONG feature (bảng chung
 * `shared/constants/error-codes.ts` đang ở trần dòng), cùng cách `career/utils/recruiter-errors.ts`.
 *  · `WELL_001` (409): chưa bật — màn chuyển sang giải thích/bật, câu này chỉ hiện khi vẫn phải báo.
 *  · `WELL_002` (403, P1): chia sẻ với nhóm mình không còn là thành viên ACTIVE (`PUT .../shares/:workspaceId`).
 *  · `WELL_003/004` (400): lỗi CẤU HÌNH luật của admin — người dùng không sửa được và không nên đọc thuật ngữ, nên dùng câu chung.
 *  · `CFG_005` (404): cờ `burnout` tắt.
 */
export const WELLBEING_ERROR_MESSAGES: Record<string, string> = {
  CFG_005: 'Tính năng này hiện chưa khả dụng',
  WELL_001: 'Bạn chưa bật theo dõi sức khoẻ học tập',
  WELL_002: 'Bạn chỉ chia sẻ được với nhóm mình đang tham gia',
  WELL_003: 'Chưa thực hiện được lúc này. Vui lòng thử lại sau',
  WELL_004: 'Chưa thực hiện được lúc này. Vui lòng thử lại sau',
};

/** Mã lỗi BE (`WELL_001`…), `null` khi không phải lỗi có cấu trúc — chỗ UI RẼ NHÁNH theo mã. */
export const wellbeingErrorCode = (error: unknown): string | null => errorCodeOf(error) ?? null;

/** `WELL_001` (409): chưa bật hoặc đã tắt (kể cả tắt ở thiết bị khác) — màn chuyển sang giải thích/bật. `PATCH` bị `WELL_001` thì BE không ghi gì và KHÔNG bao giờ bật lại. */
export const isNotEnabled = (error: unknown): boolean => wellbeingErrorCode(error) === 'WELL_001';

/** `CFG_005`: cờ `burnout` tắt (admin tắt phân hệ khi người dùng đang ở giữa màn). */
export const isFeatureOff = (error: unknown): boolean => wellbeingErrorCode(error) === 'CFG_005';

/** `WELL_002` (P1, 403): mình không còn là thành viên ACTIVE của nhóm định chia sẻ (rời nhóm giữa chừng, sai id…). */
export const isNotMember = (error: unknown): boolean => wellbeingErrorCode(error) === 'WELL_002';

/** 404 KHÔNG phải do cờ tắt: cảnh báo không còn (đã bấm ở máy khác, hoặc bị xoá cùng dữ liệu). Kết quả người dùng muốn coi như đã có. */
export const isGone = (error: unknown): boolean =>
  httpStatusOf(error) === 404 && !isFeatureOff(error);

/** Câu cho người dùng: ưu tiên nhãn của feature, còn lại dùng bộ dịch chung (mạng, 5xx, 429…). */
export function wellbeingErrorMessage(error: unknown): string {
  const code = wellbeingErrorCode(error);
  return (code && WELLBEING_ERROR_MESSAGES[code]) || toErrorMessage(error);
}
