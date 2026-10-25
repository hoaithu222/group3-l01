import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync";
import { ResponseUtils, type CursorMeta } from "../../core/utils/response";
import { UnauthorizedError } from "../../core/exceptions";
import type { AuthUser } from "../../core/types/express";
import type { BlocksService } from "./blocks.service";
import type { BlockDto, ListBlocksQueryDto } from "./blocks.validators";

function requireUser(req: Request): AuthUser {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

export function createBlocksController(service: BlocksService) {
  const list = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const { data, meta } = await service.list(user.id, req.query as unknown as ListBlocksQueryDto);
    // `meta.allIds` (≤ LIMITS.block.max) — client lọc "tin từ người đã chặn" không cần tải hết các trang.
    const cursorMeta: CursorMeta & { allIds: string[] } = meta;
    ResponseUtils.cursor(res, { data, meta: cursorMeta }, "Danh sách người đã chặn");
  });

  const block = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const { userId } = req.body as BlockDto;
    const { alreadyBlocked, ...result } = await service.block(user.id, userId);
    ResponseUtils.success(res, result, alreadyBlocked ? "Đã chặn người dùng này" : "Đã chặn", alreadyBlocked ? 200 : 201);
  });

  const unblock = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    await service.unblock(user.id, req.params.userId);
    ResponseUtils.success(res, null, "Đã bỏ chặn");
  });

  return { list, block, unblock };
}
