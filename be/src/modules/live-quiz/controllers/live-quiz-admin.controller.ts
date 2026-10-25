import type { Request, Response } from "express";
import type { z } from "zod";
import { UnauthorizedError } from "../../../core/exceptions";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { reasonSchema } from "../../../shared/dto/common-schemas";
import type { AdminSessionsQueryDto } from "../dtos";
import type { LiveQuizService } from "../services/live-quiz.service";

function requireUser(req: Request) {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

/** Admin `/admin/live-quiz/sessions*` (p5-01 be.md §4) — query/body đã validate bằng Zod ở routes. */
export function createLiveQuizAdminController(service: LiveQuizService) {
  const list = catchAsync(async (req: Request, res: Response) => {
    const q = req.query as unknown as AdminSessionsQueryDto;
    const { items, total } = await service.adminList(q);
    const totalPages = Math.ceil(total / q.limit);
    ResponseUtils.paginated(res, {
      data: items,
      meta: { page: q.page, limit: q.limit, total, totalPages, hasNext: q.page * q.limit < total, hasPrev: q.page > 1 },
    });
  });

  const get = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await service.adminGet(req.params.id));
  });

  const end = catchAsync(async (req: Request, res: Response) => {
    const { reason } = req.body as z.infer<typeof reasonSchema>;
    ResponseUtils.success(res, await service.adminEnd(requireUser(req), req.params.id, reason), "Đã huỷ phiên thi");
  });

  return { list, get, end };
}
