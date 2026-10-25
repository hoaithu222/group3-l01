import { isAxiosError } from 'axios';

import type { ApiErrorBody } from '@/core/api/client.types';
import { errorCodeOf, httpStatusOf, toErrorMessage } from '@/shared/utils/errors';

import type { PortfolioSectionKind } from '../api/portfolio.types';
import { SECTION_LABELS } from '../constants/portfolio.constants';

export const SLUG_INVALID_MESSAGE =
  'Đường dẫn chỉ gồm chữ thường, số và dấu gạch ngang (3–30 ký tự), không bắt đầu hoặc kết thúc bằng dấu gạch ngang.';
export const TAKEN_DOWN_MESSAGE = 'Hồ sơ đã bị gỡ do vi phạm. Liên hệ hỗ trợ để được xem xét.';
export const VERSION_CONFLICT_MESSAGE =
  'Hồ sơ vừa được thay đổi ở nơi khác. Tải lại để lưu tiếp trên bản mới.';

/**
 * Câu tiếng Việt cho mã `PORT_001..012` (p6-07 be.md §8) — đặt TRONG feature (`shared/constants/error-codes.ts` đã chạm trần, cùng cách
 * `CONTRIBUTION_ERROR_MESSAGES`). Câu của BE cũng đã là tiếng Việt, nhưng bảng này bảo đảm app không phụ thuộc chữ phía server và cho câu HƯỚNG DẪN
 * việc cần làm (câu của BE chỉ nêu sự cố). `PORT_010` không có ở đây: nó ghép thêm tên mục còn trống, xem `portfolioErrorMessage`.
 */
export const PORTFOLIO_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  PORT_001: 'Đường dẫn này đã có người dùng, hãy chọn đường dẫn khác.',
  PORT_002: SLUG_INVALID_MESSAGE,
  PORT_003: 'Đường dẫn chứa từ không được phép, hãy chọn đường dẫn khác.',
  PORT_004: 'Bạn chưa có task hoàn thành nào được ghi nhận trong nhóm này.',
  PORT_005: 'Hồ sơ đã đạt số dự án tối đa. Xoá bớt một dự án rồi thêm lại.',
  PORT_006: 'Dự án này đã có trong hồ sơ.',
  PORT_007: 'Bạn làm mới số liệu quá nhiều, vui lòng thử lại sau.',
  PORT_008: TAKEN_DOWN_MESSAGE,
  PORT_009: 'Hồ sơ đang được tạo trang, vui lòng đợi.',
  PORT_011: 'Hồ sơ chưa được công khai.',
  PORT_012: 'Hồ sơ không ở trạng thái bị gỡ.',
  RES_003: VERSION_CONFLICT_MESSAGE,
};

const EMPTY_PORTFOLIO_BASE = 'Hồ sơ chưa có nội dung để công khai.';

function detailsOf(error: unknown): Record<string, unknown> | undefined {
  if (!isAxiosError(error)) return undefined;
  const details = (error.response?.data as ApiErrorBody | undefined)?.error?.details;
  return details && typeof details === 'object' ? (details as Record<string, unknown>) : undefined;
}

const isSectionKind = (value: unknown): value is PortfolioSectionKind =>
  typeof value === 'string' && value in SECTION_LABELS;

const sectionList = (value: unknown): PortfolioSectionKind[] =>
  Array.isArray(value) ? value.filter(isSectionKind) : [];

/** `PORT_010`: BE nói MỤC nào đang bật mà còn trống (`emptySections`) hoặc mọi mục đang tắt (`visibleSections` rỗng) — chỉ đúng chỗ cần sửa. */
function emptyPortfolioMessage(error: unknown): string {
  const details = detailsOf(error);
  if (
    details &&
    sectionList(details.visibleSections).length === 0 &&
    Array.isArray(details.visibleSections)
  ) {
    return `${EMPTY_PORTFOLIO_BASE} Bạn đã tắt mọi mục — hãy bật ít nhất một mục ở màn Giao diện.`;
  }
  const empty = sectionList(details?.emptySections);
  if (empty.length === 0) return EMPTY_PORTFOLIO_BASE;
  return `${EMPTY_PORTFOLIO_BASE} Hãy bổ sung nội dung cho: ${empty.map((kind) => SECTION_LABELS[kind]).join(', ')}.`;
}

/** Câu cho một lỗi bất kỳ: `PORT_*`/`RES_003` tra bảng của feature, còn lại theo `toErrorMessage` chung (mất mạng, 403, 5xx…). */
export function portfolioErrorMessage(error: unknown): string {
  const code = errorCodeOf(error);
  if (code === 'PORT_010') return emptyPortfolioMessage(error);
  return (code ? PORTFOLIO_ERROR_MESSAGES[code] : undefined) ?? toErrorMessage(error);
}

/** `RES_003` (409) — hồ sơ/dự án vừa bị thiết bị khác đổi (CAS `expectedVersion` lệch): tải lại rồi lưu tiếp, GIỮ nội dung đang gõ. */
export function isVersionConflict(error: unknown): boolean {
  return httpStatusOf(error) === 409 && errorCodeOf(error) === 'RES_003';
}

/** Mã lỗi của trường slug (`PORT_001..003`) — hiện ngay dưới ô nhập thay vì hộp thoại. */
export function isSlugError(error: unknown): boolean {
  const code = errorCodeOf(error);
  return code === 'PORT_001' || code === 'PORT_002' || code === 'PORT_003';
}

/** Cờ `career` hoặc công tắc khẩn cấp `portfolio.enabled` tắt ⇒ BE trả 404 `CFG_005` (`FeatureDisabledError`). */
export function isFeatureOff(error: unknown): boolean {
  return errorCodeOf(error) === 'CFG_005';
}

/** 404 — dự án/hồ sơ không còn. */
export function isGone(error: unknown): boolean {
  return httpStatusOf(error) === 404 && !isFeatureOff(error);
}
