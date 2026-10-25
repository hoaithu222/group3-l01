import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import { UnauthorizedError } from "../../../core/exceptions";
import type { FolderService } from "../services/folder.service";
import type { CreateFolderDto, DeleteFolderQueryDto, ListFoldersQueryDto, UpdateFolderDto } from "../dtos";

function requireUser(req: Request) {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

export function createFolderController(service: FolderService) {
  const list = catchAsync(async (req: Request, res: Response) => {
    const { parentId } = req.query as unknown as ListFoldersQueryDto;
    ResponseUtils.success(res, await service.list(requireUser(req), req.params.workspaceId, parentId));
  });

  const create = catchAsync(async (req: Request, res: Response) => {
    const folder = await service.create(requireUser(req), req.params.workspaceId, req.body as CreateFolderDto);
    ResponseUtils.success(res, folder, "Đã tạo thư mục", 201);
  });

  const update = catchAsync(async (req: Request, res: Response) => {
    const folder = await service.update(requireUser(req), req.params.id, req.body as UpdateFolderDto);
    ResponseUtils.success(res, folder, "Đã cập nhật thư mục");
  });

  const remove = catchAsync(async (req: Request, res: Response) => {
    const { recursive } = req.query as unknown as DeleteFolderQueryDto;
    await service.remove(requireUser(req), req.params.id, recursive);
    res.status(204).send();
  });

  const restore = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await service.restore(requireUser(req), req.params.id), "Đã khôi phục thư mục");
  });

  return { list, create, update, remove, restore };
}
