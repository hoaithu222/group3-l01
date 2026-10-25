import type { Request, Response } from "express";
import { UnauthorizedError } from "../../../core/exceptions";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { WellbeingShareService } from "../services/wellbeing-share.service";

function requireUser(req: Request) {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

/**
 * P1 — chia sẻ mức rủi ro với trưởng nhóm (be.md §4). `/me/wellbeing/shares*`: CHỈ thao tác trên CHÍNH mình (`userId` từ token). `/workspaces/:id/wellbeing/indicators`:
 * quyền OWNER/ADMIN đã kiểm ở middleware route (`requireWorkspaceRole`) TRƯỚC khi vào đây — handler chỉ đọc `req.params.id`.
 */
export function createWellbeingShareController(d: { share: WellbeingShareService }) {
  const noStore = (res: Response): void => {
    res.setHeader("Cache-Control", "no-store");
  };

  const list = catchAsync(async (req: Request, res: Response) => {
    noStore(res);
    ResponseUtils.success(res, await d.share.list(requireUser(req).id), "Chia sẻ với nhóm");
  });

  const share = catchAsync(async (req: Request, res: Response) => {
    const dto = await d.share.share(requireUser(req).id, req.params.workspaceId);
    noStore(res);
    ResponseUtils.success(res, dto, "Đã bật chia sẻ với nhóm");
  });

  const unshare = catchAsync(async (req: Request, res: Response) => {
    await d.share.unshare(requireUser(req).id, req.params.workspaceId);
    res.status(204).end();
  });

  const indicators = catchAsync(async (req: Request, res: Response) => {
    noStore(res);
    ResponseUtils.success(res, await d.share.indicators(req.params.id), "Chỉ báo sức khoẻ học tập của nhóm");
  });

  return { list, share, unshare, indicators };
}
