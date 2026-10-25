import type { Request, Response } from "express";
import { UnauthorizedError } from "../../../core/exceptions";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { AckDto, AssessmentsQueryDto, PatchSettingDto, UpdateSettingDto } from "../dtos";
import type { BurnoutHistoryService } from "../services/burnout-history.service";
import type { BurnoutSettingService } from "../services/burnout-setting.service";

function requireUser(req: Request) {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

/**
 * `/me/wellbeing*` — người dùng chỉ thao tác trên CHÍNH mình (id lấy từ token, KHÔNG từ path/body/query): không có endpoint nào nhận `userId`, nên không có đường nào xem/sửa/xoá dữ liệu của người khác.
 * Không có logic nghiệp vụ ở đây (chỉ đọc request → gọi service → trả response).
 */
export function createBurnoutController(d: { settings: BurnoutSettingService; history: BurnoutHistoryService }) {
  /** Dữ liệu sức khoẻ tinh thần: không cho bộ nhớ đệm của trình duyệt/trung gian giữ lại (cùng cách `assets`/`documents`). */
  const noStore = (res: Response): void => {
    res.setHeader("Cache-Control", "no-store");
  };

  const get = catchAsync(async (req: Request, res: Response) => {
    noStore(res);
    ResponseUtils.success(res, await d.settings.get(requireUser(req).id));
  });

  const update = catchAsync(async (req: Request, res: Response) => {
    const setting = await d.settings.update(requireUser(req).id, req.body as UpdateSettingDto);
    noStore(res);
    ResponseUtils.success(res, setting, setting.enabled ? "Đã lưu cài đặt" : "Đã tắt theo dõi và xoá dữ liệu");
  });

  const patch = catchAsync(async (req: Request, res: Response) => {
    const setting = await d.settings.patch(requireUser(req).id, req.body as PatchSettingDto);
    noStore(res);
    ResponseUtils.success(res, setting, "Đã lưu cài đặt");
  });

  const assessments = catchAsync(async (req: Request, res: Response) => {
    noStore(res);
    ResponseUtils.success(res, await d.history.history(requireUser(req).id, (req.query as unknown as AssessmentsQueryDto).days), "Sức khoẻ học tập");
  });

  const ack = catchAsync(async (req: Request, res: Response) => {
    await d.history.acknowledge(requireUser(req).id, req.params.id, (req.body as AckDto).action);
    res.status(204).end();
  });

  const deleteData = catchAsync(async (req: Request, res: Response) => {
    await d.settings.deleteMyData(requireUser(req).id);
    res.status(204).end();
  });

  /** `POST /me/wellbeing/break` (P1) — TakeABreakWidget báo đã nghỉ xong; `req.body` đã qua `validateBody(breakSchema)` nhưng KHÔNG lưu gì (be.md §4: chỉ đếm qua rate limiter, không ảnh hưởng điểm). */
  const takeBreak = catchAsync(async (req: Request, res: Response) => {
    requireUser(req);
    res.status(204).end();
  });

  return { get, update, patch, assessments, ack, deleteData, takeBreak };
}
