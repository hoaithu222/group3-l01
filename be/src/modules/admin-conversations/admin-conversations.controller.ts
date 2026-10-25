import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync";
import { ResponseUtils } from "../../core/utils/response";
import { UnauthorizedError } from "../../core/exceptions";
import type { AuthUser } from "../../core/types/express";
import type { AdminConversationsService } from "./admin-conversations.service";
import type { AdminListConversationsQueryDto } from "./admin-conversations.validators";

function requireUser(req: Request): AuthUser {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

export function createAdminConversationsController(service: AdminConversationsService) {
  // be.md §4 — `stats` là field TOP-LEVEL cạnh `data`/`meta` (không thuộc
  // riêng 1 dòng nào) — `ResponseUtils.paginated()` chỉ hỗ trợ đúng
  // `{data, meta}`, không có chỗ cho field thứ 3 → dùng `success()` với
  // payload lồng `{data, meta, stats}` thay vì `paginated()`.
  const list = catchAsync(async (req: Request, res: Response) => {
    const query = req.query as unknown as AdminListConversationsQueryDto;
    const { data, total, stats } = await service.list(req.params.workspaceId, query);
    const meta = {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit) || 1,
      hasNext: query.page * query.limit < total,
      hasPrev: query.page > 1,
    };
    ResponseUtils.success(res, { data, meta, stats });
  });

  const dissolve = catchAsync(async (req: Request, res: Response) => {
    const admin = requireUser(req);
    const result = await service.dissolve(admin.id, req.params.id);
    ResponseUtils.success(res, result, "Đã giải tán hội thoại");
  });

  return { list, dissolve };
}
