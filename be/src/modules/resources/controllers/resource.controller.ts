import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import { UnauthorizedError } from "../../../core/exceptions";
import type { ResourceService } from "../services/resource.service";
import type { ResourceListService } from "../services/resource-list.service";
import type { ResourceMutationService } from "../services/resource-mutation.service";
import type { TrashService } from "../services/trash.service";
import type {
  CreateResourceDto,
  ListResourcesQueryDto,
  ResourceUrlQueryDto,
  TrashQueryDto,
  UpdateResourceDto,
} from "../dtos";

function requireUser(req: Request) {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

export function createResourceController(
  resources: ResourceService,
  lists: ResourceListService,
  mutations: ResourceMutationService,
  trash: TrashService
) {
  const list = catchAsync(async (req: Request, res: Response) => {
    const page = await lists.list(requireUser(req), req.params.workspaceId, req.query as unknown as ListResourcesQueryDto);
    ResponseUtils.cursor(res, page);
  });

  const create = catchAsync(async (req: Request, res: Response) => {
    const dto = await resources.create(requireUser(req), req.params.workspaceId, req.body as CreateResourceDto);
    ResponseUtils.success(res, dto, "Đã thêm tệp vào kho tài liệu", 201);
  });

  const get = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await resources.get(requireUser(req), req.params.id));
  });

  const patch = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await mutations.patch(requireUser(req), req.params.id, req.body as UpdateResourceDto), "Đã cập nhật tệp");
  });

  const remove = catchAsync(async (req: Request, res: Response) => {
    await mutations.remove(requireUser(req), req.params.id);
    res.status(204).send();
  });

  const restore = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await mutations.restore(requireUser(req), req.params.id), "Đã khôi phục tệp");
  });

  const url = catchAsync(async (req: Request, res: Response) => {
    const result = await resources.url(requireUser(req), req.params.id, req.query as unknown as ResourceUrlQueryDto);
    res.setHeader("Cache-Control", "no-store"); // URL ký ≤ 60 s — không để proxy/trình duyệt giữ lại
    ResponseUtils.success(res, result, "Đường dẫn tải tệp");
  });

  const trashList = catchAsync(async (req: Request, res: Response) => {
    const page = await trash.list(requireUser(req), req.params.workspaceId, req.query as unknown as TrashQueryDto);
    // Khác các danh sách khác: `data = { folders, resources }` (2 danh sách) + `meta` cursor cùng cấp — đúng hợp đồng
    // be.md §4; `ResponseUtils.cursor` chỉ chuyển `data` nguyên trạng nên ép kiểu 1 lần ở đây.
    ResponseUtils.cursor(res, { data: { folders: page.folders, resources: page.resources } as unknown as unknown[], meta: page.meta });
  });

  const trashPurge = catchAsync(async (req: Request, res: Response) => {
    await trash.purgeNow(requireUser(req), req.params.workspaceId, req.params.resourceId);
    res.status(204).send();
  });

  const storage = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await trash.usage(requireUser(req), req.params.workspaceId));
  });

  return { list, create, get, patch, remove, restore, url, trashList, trashPurge, storage };
}
