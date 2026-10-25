import { AppError, ScopeNotFoundError, VersionConflictError } from "../../core/exceptions";
import { ErrorCode, ErrorMessages, type ErrorCodeType } from "../../core/utils/error.codes";
import type { HttpStatusCodeType } from "../../core/constants";

const make = (code: ErrorCodeType, status: HttpStatusCodeType, details?: unknown) => new AppError(ErrorMessages[code], status, code, details);

/**
 * Mã lỗi `POLL_*`/`SCHED_*`/`REMIND_*` (p7-04 be.md §8) — factory để service dùng chung thông điệp/HTTP. Lỗi của engine tin nhắn (`MSG_*`), `RES_003`, `VAL_001`… được ném NGUYÊN VẸN từ nơi
 * phát sinh (cổng `IMessageSendPort`, `VersionConflictError`) — không map lại ở đây.
 */
export const chatErrors = {
  // Khảo sát
  pollOptionsInvalid: () => make(ErrorCode.POLL_001, 400),
  pollClosesAtInvalid: () => make(ErrorCode.POLL_002, 400),
  pollSingleChoiceOnly: () => make(ErrorCode.POLL_003, 400),
  pollClosed: () => make(ErrorCode.POLL_004, 409),
  /** 404 — không có khảo sát / không đọc được tin chứa nó / lựa chọn lạ (không phân biệt: trung tính, POLL-05). */
  pollNotFound: () => make(ErrorCode.POLL_005, 404),
  pollAnonymous: () => make(ErrorCode.POLL_006, 403),
  // Tin hẹn giờ
  scheduledSendAtInvalid: () => make(ErrorCode.SCHED_001, 400),
  scheduledTooMany: (max: number) => make(ErrorCode.SCHED_002, 409, { max }),
  scheduledNotPending: () => make(ErrorCode.SCHED_003, 409),
  scheduledCannotSend: () => make(ErrorCode.SCHED_004, 403),
  // Nhắc lại
  reminderRemindAtInvalid: () => make(ErrorCode.REMIND_001, 400),
  reminderTooMany: (max: number) => make(ErrorCode.REMIND_002, 409, { max }),
  // Dùng lại
  /** 404 `MSG_012` — tin không tồn tại / người gọi không đọc được / đã thu hồi (lúc đặt nhắc, chuyển tin). */
  messageNotFound: () => make(ErrorCode.MSG_012, 404),
  /** 409 `MSG_006` — tin đã thu hồi hoặc không phải tin người dùng (chuyển thành thẻ/tài liệu). */
  messageNotConvertible: () => make(ErrorCode.MSG_006, 409),
  /** 403 `MSG_004` — thấy phạm vi nhưng không có quyền ghi. */
  cannotWrite: () => make(ErrorCode.MSG_004, 403),
  /** 404 trung tính (`PERM_404`) — không phân biệt "không có" / "không được thấy" (02-conventions §2). */
  notFound: () => new ScopeNotFoundError(),
  /** `expectedVersion` lệch → 409 `RES_003` + `details.currentVersion`. */
  versionConflict: (current: number) => new VersionConflictError(current),
  /** Ghi đồng thời thua liên tục (đua bầu) — client thử lại. */
  busy: () => make(ErrorCode.SYS_503, 503, { retryable: true }),
} as const;
