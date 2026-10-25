import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { HeatmapQueryDto } from "../dtos";
import type { HeatmapService } from "../services/heatmap.service";

const actor = (req: Request) => req.user!;

export function createHeatmapController(heatmap: HeatmapService) {
  const board = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await heatmap.boardHeatmap(actor(req), req.params.id, req.query as unknown as HeatmapQueryDto), "Hoạt động theo ngày");
  });

  const workspace = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await heatmap.workspaceHeatmap(actor(req), req.params.id, req.query as unknown as HeatmapQueryDto), "Hoạt động theo ngày của nhóm");
  });

  return { board, workspace };
}
