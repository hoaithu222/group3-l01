import type { NextFunction, Request, Response } from "express";
import type { z } from "zod";
import { AppError, ScopeForbiddenError, UnauthorizedError, ValidationError } from "../../../core/exceptions";
import { permissionService, type Action } from "../../../core/permission";
import { ErrorCode, ErrorMessages, type ErrorCodeType } from "../../../core/utils/error.codes";
import { catchAsync } from "../../../core/utils/catchAsync";
import { meetError } from "../services/meeting-errors";

const MEET_CODE = /^MEET_\d{3}$/;

/**
 * Như `validateBody` nhưng lỗi nghiệp vụ trong `superRefine` (message = mã `MEET_xxx`, be.md §3) trả ĐÚNG mã đó (HTTP 400) thay vì
 * `VAL_001` chung — client hiển thị đúng thông điệp tiếng Việt của mã (MT-02). Lỗi cấu trúc khác vẫn là `VAL_001` kèm `details`.
 */
export function validateMeetingBody<T extends z.ZodType>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body);
    if (parsed.success) {
      req.body = parsed.data;
      return next();
    }
    const business = parsed.error.issues.find((i) => MEET_CODE.test(i.message));
    if (business) {
      const code = business.message as ErrorCodeType;
      return next(new AppError(ErrorMessages[code], 400, code, { field: business.path.join(".") }));
    }
    next(new ValidationError("Dữ liệu không hợp lệ", parsed.error.flatten().fieldErrors));
  };
}

/** Hành động chỉ dành cho chủ trì/đồng chủ trì (thấy cuộc họp nhưng không được làm → `MEET_002`). */
const HOST_ONLY: ReadonlySet<Action> = new Set<Action>(["meeting.edit", "meeting.invite", "meeting.attendee.remove", "meeting.role.manage", "meeting.start", "meeting.end", "meeting.lobby.admit"]);

/**
 * Kiểm quyền theo scope `MEETING` (be.md §4 `scope(action)`): không thấy → 404 `MEET_001` (trung tính, không lộ tồn tại);
 * thấy nhưng không được làm → 403 (`MEET_002` cho việc của chủ trì, `PERM_004` cho việc khác). Gắn kết quả vào `req.access.MEETING`.
 */
export function requireMeeting(action: Action, param = "meetingId") {
  return catchAsync(async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const id = req.params[param];
    const access = await permissionService.resolve(req.user, { type: "MEETING", id });
    if (!access.visible) throw meetError(ErrorCode.MEET_001, 404);
    if (!access.actions.has(action)) {
      if (HOST_ONLY.has(action)) throw meetError(ErrorCode.MEET_002, 403);
      throw new ScopeForbiddenError(ErrorMessages[ErrorCode.PERM_004], ErrorCode.PERM_004);
    }
    req.access = { ...(req.access ?? {}), MEETING: access };
    next();
  });
}
