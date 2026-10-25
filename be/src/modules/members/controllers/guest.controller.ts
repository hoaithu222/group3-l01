import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import { UnauthorizedError } from "../../../core/exceptions";
import type { GuestService } from "../services/guest.service";
import type { MemberQueryService } from "../services/member-query.service";
import type { WorkspaceRoleValue } from "../entities/member.interface";
import type { UpdateGuestDto } from "../dtos";

export function createGuestController(guests: GuestService, members: MemberQueryService) {
  /** `PATCH /workspaces/:id/members/:userId/guest` → thẻ khách mới (kèm `version` mới, `expiresAt`, `guestChannelIds`). */
  const update = catchAsync(async (req: Request, res: Response) => {
    const user = req.user;
    const role = req.access?.WORKSPACE?.role;
    if (!user) throw new UnauthorizedError("Bạn cần đăng nhập");
    if (!role) throw new Error("[members] Thiếu req.access.WORKSPACE — route quên gắn requireWorkspaceRole()");
    const { workspaceId, userId } = req.params;
    await guests.update(user, workspaceId, userId, req.body as UpdateGuestDto);
    const card = await members.getCard(user.id, role as WorkspaceRoleValue, workspaceId, userId);
    ResponseUtils.success(res, card, "Đã cập nhật quyền khách");
  });

  return { update };
}
