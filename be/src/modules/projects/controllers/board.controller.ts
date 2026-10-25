import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { CreateBoardDto, ListBoardsQueryDto, PutColumnsDto, UpdateBoardDto } from "../dtos";
import type { BoardService } from "../services/board.service";

const actor = (req: Request) => req.user!;

/** Controller factory (api-patterns.md) — chỉ parse request, gọi service, trả response. */
export function createBoardController(boards: BoardService) {
  const list = catchAsync(async (req: Request, res: Response) => {
    const { archived } = req.query as unknown as ListBoardsQueryDto;
    ResponseUtils.success(res, await boards.list(actor(req), req.params.workspaceId, archived));
  });
  const create = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await boards.create(actor(req), req.params.workspaceId, req.body as CreateBoardDto), "Đã tạo bảng", 201);
  });
  const get = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await boards.get(actor(req), req.params.id));
  });
  const patch = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await boards.patch(actor(req), req.params.id, req.body as UpdateBoardDto), "Đã cập nhật bảng");
  });
  const putColumns = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await boards.putColumns(actor(req), req.params.id, req.body as PutColumnsDto), "Đã cập nhật cột");
  });
  const archive = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await boards.archive(actor(req), req.params.id), "Đã lưu trữ bảng");
  });
  const restore = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await boards.restore(actor(req), req.params.id), "Đã khôi phục bảng");
  });
  return { list, create, get, patch, putColumns, archive, restore };
}
