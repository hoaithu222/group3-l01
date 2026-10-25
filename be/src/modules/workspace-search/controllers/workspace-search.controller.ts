import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { CursorMeta } from "../../../core/utils/response";
import type { WorkspaceSearchQueryDto } from "../dtos";
import type { WorkspaceSearchService } from "../services/workspace-search.service";

export function createWorkspaceSearchController(service: WorkspaceSearchService) {
  /** `req.access.WORKSPACE` do `requireWorkspaceRole("GUEST")` gắn trước. */
  const search = catchAsync(async (req: Request, res: Response) => {
    const access = req.access!.WORKSPACE!;
    const result = await service.search(req.user!, req.params.workspaceId, access, req.query as unknown as WorkspaceSearchQueryDto);
    // `partial`/`truncated` là trường mở rộng của meta cursor chuẩn.
    const meta: CursorMeta & { partial: boolean; truncated: boolean } = result.meta;
    ResponseUtils.cursor(res, { data: result.data, meta });
  });

  return { search };
}
