import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { CreateBoardFromTemplateDto, DuplicateBoardDto } from "../dtos";
import type { BoardBlueprintService } from "../services/board-blueprint.service";

const actor = (req: Request) => req.user!;

/** p3-02 P1: mẫu bảng + sao chép bảng. Chỉ parse request → gọi service → trả response. */
export function createBoardBlueprintController(blueprints: BoardBlueprintService) {
  const templates = catchAsync(async (_req: Request, res: Response) => {
    ResponseUtils.success(res, blueprints.templates());
  });
  const fromTemplate = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await blueprints.createFromTemplate(actor(req), req.params.workspaceId, req.body as CreateBoardFromTemplateDto), "Đã tạo bảng từ mẫu", 201);
  });
  const duplicate = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await blueprints.duplicate(actor(req), req.params.id, req.body as DuplicateBoardDto), "Đã sao chép bảng", 201);
  });
  return { templates, fromTemplate, duplicate };
}
