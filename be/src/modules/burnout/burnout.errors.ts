import { AppError, NotFoundError } from "../../core/exceptions";
import { ErrorCode, ErrorMessages, type ErrorCodeType } from "../../core/utils/error.codes";
import type { HttpStatusCodeType } from "../../core/constants";
import type { RuleSetIssue } from "./domain/burnout-rules";

const make = (code: ErrorCodeType, status: HttpStatusCodeType, details?: unknown) => new AppError(ErrorMessages[code], status, code, details);

/**
 * Mã lỗi `WELL_*` (p7-03 be.md §8). `details` chỉ chứa lỗi CẤU HÌNH của admin, không bao giờ dữ liệu của người dùng.
 */
export const burnoutErrors = {
  /** 409 — chưa bật theo dõi (app điều hướng sang màn giải thích/bật). */
  notEnabled: () => make(ErrorCode.WELL_001, 409),
  /** 403 — P1: chia sẻ (`PUT /me/wellbeing/shares/:workspaceId`) với nhóm mà mình KHÔNG phải thành viên ACTIVE. */
  notMember: () => make(ErrorCode.WELL_002, 403),
  /** 400 — bộ luật vi phạm ràng buộc chéo (mã luật trùng, luật nhìn xa hơn cửa sổ…). */
  invalidRules: (issues: readonly RuleSetIssue[]) => make(ErrorCode.WELL_003, 400, { issues }),
  /** 400 — `levels.medium ≥ levels.high`. */
  levelsOrder: () => make(ErrorCode.WELL_004, 400),
  /** 404 chung (RES_001) cho id không tồn tại/không thuộc người gọi — không phân biệt để không dò được id của người khác. */
  notFound: (what: string) => new NotFoundError(what),
} as const;
