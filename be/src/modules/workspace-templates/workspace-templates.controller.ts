import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync";
import { ResponseUtils } from "../../core/utils/response";
import type { WorkspaceTemplateService } from "./workspace-templates.service";
import type { AdminUpdateTemplateDto, ApplyTemplateDto } from "./workspace-templates.validators";

export function createWorkspaceTemplateController(service: WorkspaceTemplateService) {
  const list = catchAsync(async (_req: Request, res: Response) => {
    ResponseUtils.success(res, await service.list());
  });

  /** `Idempotency-Key` đã được middleware `idempotencyKey(..., { required: true })` kiểm — ở đây chỉ lấy giá trị làm khoá DB. */
  const apply = catchAsync(async (req: Request, res: Response) => {
    const body = req.body as ApplyTemplateDto;
    const key = req.header("Idempotency-Key") as string;
    const result = await service.apply(req.user!.id, req.params.workspaceId, req.params.code, body.channelKeys, key);
    ResponseUtils.success(res, result, "Đã áp mẫu");
  });

  const adminList = catchAsync(async (_req: Request, res: Response) => {
    ResponseUtils.success(res, await service.adminList());
  });

  const adminGet = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await service.adminGet(req.params.code));
  });

  const adminUpdate = catchAsync(async (req: Request, res: Response) => {
    const result = await service.adminUpdate({ id: req.user!.id, role: req.user!.role }, req.params.code, req.body as AdminUpdateTemplateDto);
    ResponseUtils.success(res, result, "Đã cập nhật mẫu");
  });

  return { list, apply, adminList, adminGet, adminUpdate };
}
