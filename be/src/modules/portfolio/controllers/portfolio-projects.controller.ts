import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { UpdateProjectDto } from "../dtos";
import type { PortfolioProjectService } from "../services/portfolio-project.service";
import { requireUser } from "./portfolio-http";

/** Dự án trong portfolio: danh sách nhóm đủ điều kiện, thêm/sửa/xoá/làm mới/sắp xếp (be.md §4). */
export function createPortfolioProjectsController(svc: PortfolioProjectService) {
  const eligible = catchAsync(async (req: Request, res: Response) => {
    const { cursor, limit } = req.query as unknown as { cursor?: string; limit: number };
    const page = await svc.eligibleWorkspaces(requireUser(req).id, cursor, limit);
    ResponseUtils.cursor(res, { data: page.items, meta: { nextCursor: page.nextCursor, hasMore: page.hasMore, limit } }, "Nhóm có thể thêm vào portfolio");
  });

  const add = catchAsync(async (req: Request, res: Response) => {
    const { workspaceId } = req.body as { workspaceId: string };
    ResponseUtils.success(res, await svc.add(requireUser(req).id, workspaceId), "Đã thêm dự án", 201);
  });

  const update = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await svc.update(requireUser(req).id, req.params.projectId, req.body as UpdateProjectDto), "Đã cập nhật dự án");
  });

  const remove = catchAsync(async (req: Request, res: Response) => {
    await svc.remove(requireUser(req).id, req.params.projectId);
    ResponseUtils.success(res, { deleted: true }, "Đã xoá dự án khỏi hồ sơ");
  });

  const refresh = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await svc.refresh(requireUser(req).id, req.params.projectId), "Đã làm mới số liệu");
  });

  const reorder = catchAsync(async (req: Request, res: Response) => {
    const { projectIds } = req.body as { projectIds: string[] };
    ResponseUtils.success(res, await svc.reorder(requireUser(req).id, projectIds), "Đã sắp xếp dự án");
  });

  return { eligible, add, update, remove, refresh, reorder };
}
