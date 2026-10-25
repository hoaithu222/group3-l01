import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils";
import { UnauthorizedError } from "../../../core/exceptions";
import type { UserService } from "../services/user.service";
import type { DeleteRequestDto, DeleteCancelDto, PrivacyDto, UpdatePhoneDto } from "../dtos";

/** Controller cho `/me/delete-request`, `/me/delete-cancel`, `/me/privacy`, `/me/phone` (be.md p0-01 §4). */
export function createMeController(userService: UserService) {
  const deleteRequest = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const { password } = req.body as DeleteRequestDto;
    const result = await userService.requestDeletion(req.user.id, password);
    ResponseUtils.success(res, result, "Đã ghi nhận yêu cầu xoá tài khoản");
  });

  // Tài khoản PENDING_DELETION bị authenticateToken chặn (AUTH_012) nên
  // route KHÔNG gắn authenticateToken — xác thực lại bằng email + password.
  const deleteCancel = catchAsync(async (req: Request, res: Response) => {
    const { email, password } = req.body as DeleteCancelDto;
    const result = await userService.cancelDeletion(email, password);
    ResponseUtils.success(res, result, "Đã huỷ yêu cầu xoá tài khoản");
  });

  const updatePrivacy = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const patch = req.body as PrivacyDto;
    const privacy = await userService.updatePrivacy(req.user.id, patch);
    ResponseUtils.success(res, privacy, "Đã cập nhật quyền riêng tư");
  });

  const updatePhone = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const { phone } = req.body as UpdatePhoneDto;
    const result = await userService.updatePhone(req.user.id, phone);
    ResponseUtils.success(res, result, phone ? "Đã cập nhật số điện thoại" : "Đã xoá số điện thoại");
  });

  return { deleteRequest, deleteCancel, updatePrivacy, updatePhone };
}
