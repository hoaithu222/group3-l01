import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { AttachDto } from "../dtos";
import type { TaskAttachmentService } from "../services/task-attachment.service";

const actor = (req: Request) => req.user!;

export function createTaskAttachmentController(attachments: TaskAttachmentService) {
  const list = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await attachments.list(actor(req), req.params.id));
  });
  const attach = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await attachments.attach(actor(req), req.params.id, req.body as AttachDto), "Đã đính kèm tệp", 201);
  });
  const detach = catchAsync(async (req: Request, res: Response) => {
    await attachments.detach(actor(req), req.params.id, req.params.assetId);
    res.status(204).send();
  });
  return { list, attach, detach };
}
