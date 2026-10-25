import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { CursorMeta } from "../../../core/utils/response";
import type { SavedListQueryDto } from "../dtos";
import type { SavedService } from "../services/saved.service";

export function createSavedController(service: SavedService) {
  const save = catchAsync(async (req: Request, res: Response) => {
    const result = await service.save(req.user!, req.params.messageId);
    ResponseUtils.success(res, result);
  });

  const unsave = catchAsync(async (req: Request, res: Response) => {
    await service.unsave(req.user!, req.params.messageId);
    ResponseUtils.success(res, null);
  });

  const list = catchAsync(async (req: Request, res: Response) => {
    const result = await service.list(req.user!, req.query as unknown as SavedListQueryDto);
    const meta: CursorMeta = result.meta;
    ResponseUtils.cursor(res, { data: result.data, meta });
  });

  return { save, unsave, list };
}
