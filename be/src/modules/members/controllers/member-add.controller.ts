import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import { UnauthorizedError } from "../../../core/exceptions";
import type { MemberAddService } from "../services/member-add.service";
import type { AddMemberDto, MemberLookupQueryDto } from "../dtos";

function requireUser(req: Request) {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

/** `GET …/member-lookup` (tra người theo email/SĐT) và `POST …/members` (thêm thẳng) — OWNER/ADMIN, route đã gắn `requireWorkspaceRole("ADMIN")`. */
export function createMemberAddController(service: MemberAddService) {
  const lookup = catchAsync(async (req: Request, res: Response) => {
    const { q } = req.query as unknown as MemberLookupQueryDto;
    const data = await service.lookup(requireUser(req), req.params.workspaceId, q);
    ResponseUtils.success(res, data);
  });

  /** 201 khi vừa thêm; 200 khi đã là thành viên (idempotent). */
  const add = catchAsync(async (req: Request, res: Response) => {
    const { userId } = req.body as AddMemberDto;
    const result = await service.add(requireUser(req), req.params.workspaceId, userId);
    const added = result.state === "ADDED";
    ResponseUtils.success(res, result, added ? "Đã thêm thành viên vào nhóm" : "Người này đã là thành viên", added ? 201 : 200);
  });

  return { lookup, add };
}
