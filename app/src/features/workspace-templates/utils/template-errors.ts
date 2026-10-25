import { isAxiosError } from 'axios';

import { getErrorCode, toErrorMessage } from '@/core/api/client.helpers';

import {
  FORBIDDEN_MESSAGE,
  RATE_LIMITED_MESSAGE,
  TEMPLATE_ERROR_MESSAGES,
} from '../constants/workspace-templates.constants';

export type TemplateErrorKind =
  /** 409 `TPL_002` — nhóm đã lưu trữ. */
  | 'archived'
  /** 409 `TPL_003` — vượt số kênh tối đa: bỏ bớt kênh rồi thử lại. */
  | 'channel-limit'
  /** 404 `CFG_005` — cờ phụ đã tắt lúc đang mở màn. */
  | 'feature-off'
  | 'forbidden'
  /** Không có phản hồi (mất mạng/timeout). */
  | 'offline'
  | 'other'
  | 'rate-limited'
  /** 404 `TPL_001` — mẫu không còn: bỏ lựa chọn, tải lại danh sách. */
  | 'template-gone';

export interface TemplateErrorInfo {
  code?: string;
  kind: TemplateErrorKind;
  message: string;
}

const KIND_BY_CODE: Record<string, TemplateErrorKind> = {
  CFG_005: 'feature-off',
  TPL_001: 'template-gone',
  TPL_002: 'archived',
  TPL_003: 'channel-limit',
};

/**
 * Lỗi của lượt tạo nhóm-kèm-mẫu / áp mẫu → loại + câu tiếng Việt. Nhãn `TPL_001..003` nằm TRONG feature này
 * (`TEMPLATE_ERROR_MESSAGES`); mã lạ rơi về câu của BE / bảng lỗi chung (`toErrorMessage`).
 */
export function describeTemplateError(error: unknown): TemplateErrorInfo {
  const fallback = toErrorMessage(error);
  if (!isAxiosError(error)) return { kind: 'other', message: fallback };
  if (!error.response) return { kind: 'offline', message: fallback };

  const code = getErrorCode(error);
  const known = KIND_BY_CODE[code];
  if (known) return { code, kind: known, message: TEMPLATE_ERROR_MESSAGES[code] ?? fallback };

  const { status } = error.response;
  if (status === 403) return { code, kind: 'forbidden', message: FORBIDDEN_MESSAGE };
  if (status === 429) return { code, kind: 'rate-limited', message: RATE_LIMITED_MESSAGE };
  return { code, kind: 'other', message: fallback };
}
