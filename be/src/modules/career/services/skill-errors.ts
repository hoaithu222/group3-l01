import { AppError } from "../../../core/exceptions";
import { HttpStatusCode } from "../../../core/constants/http-status";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";

/** Lỗi nghiệp vụ `SKILL_00x` (be.md §8) — mã + thông điệp lấy từ `error.codes.ts`, không hardcode chuỗi. */
export const skillCodeTaken = (code: string) => new AppError(ErrorMessages.SKILL_001, HttpStatusCode.CONFLICT, ErrorCode.SKILL_001, { code });

export const invalidCriteria = (details: unknown) => new AppError(ErrorMessages.SKILL_002, HttpStatusCode.BAD_REQUEST, ErrorCode.SKILL_002, details);

export const noBadge = () => new AppError(ErrorMessages.SKILL_003, HttpStatusCode.NOT_FOUND, ErrorCode.SKILL_003);

export const notRevoked = () => new AppError(ErrorMessages.SKILL_004, HttpStatusCode.CONFLICT, ErrorCode.SKILL_004);

export const tooManySkills = (max: number) => new AppError(ErrorMessages.SKILL_005, HttpStatusCode.CONFLICT, ErrorCode.SKILL_005, { max });

export const reevaluateTooSoon = (retryAfterSeconds: number) =>
  new AppError(ErrorMessages.SKILL_006, HttpStatusCode.TOO_MANY_REQUESTS, ErrorCode.SKILL_006, { retryAfterSeconds });
