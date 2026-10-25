import type { Request, Response } from "express";
import { UnauthorizedError } from "../../../core/exceptions";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { AdminDeleteRecordingQueryDto, AdminRecordingListQueryDto } from "../dtos";
import type { AdminRecordingService } from "../services/admin-recording.service";

/** Controller mỏng cho tab "Ghi hình" của admin (p2-06 admin.md): chỉ metadata — KHÔNG có endpoint phát/tải/cấp URL ký. */
export function createAdminRecordingsController(service: () => AdminRecordingService) {
  const list = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.paginated(res, await service().list(req.query as unknown as AdminRecordingListQueryDto), "Bản ghi hình cuộc họp");
  });

  const summary = catchAsync(async (req: Request, res: Response) => {
    const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : undefined;
    ResponseUtils.success(res, await service().summary(workspaceId), "Tóm tắt ghi hình");
  });

  const detail = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await service().detail(req.params.recordingId), "Chi tiết bản ghi");
  });

  const remove = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    await service().delete(req.user.id, req.params.recordingId, req.query as unknown as AdminDeleteRecordingQueryDto);
    res.status(204).send();
  });

  return { list, summary, detail, remove };
}
