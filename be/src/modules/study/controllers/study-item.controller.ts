import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import { UnauthorizedError } from "../../../core/exceptions";
import type { ListItemsQueryDto, PutItemsDto } from "../dtos";
import type { StudyItemBulkService } from "../services/study-item-bulk.service";
import type { StudyItemQueryService } from "../services/study-item-query.service";

function requireUser(req: Request) {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

export function createStudyItemController(query: StudyItemQueryService, bulk: StudyItemBulkService) {
  const list = catchAsync(async (req: Request, res: Response) => {
    // `meta` có thêm `setVersion` (ngoài `CursorMeta`) — `ResponseUtils.cursor` chỉ chuyển nguyên trạng.
    ResponseUtils.cursor(res, await query.list(requireUser(req), req.params.id, req.query as unknown as ListItemsQueryDto), "Danh sách mục học");
  });

  const put = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await bulk.save(requireUser(req), req.params.id, req.body as PutItemsDto), "Đã lưu bộ học");
  });

  return { list, put };
}
