import type { Request, Response } from "express";
import { UserService } from "../services/user.service";
import type { UserAvatarService } from "../services/user-avatar.service";
import { ResponseUtils } from "../../../core/utils";
import { catchAsync } from "../../../core/utils/catchAsync";
import type { PaginatedResponse } from "../../../core/utils/response";
import { roleHasPermission } from "../../../core/constants/permissions";
import { UnauthorizedError } from "../../../core/exceptions";
import type {
  ListUsersQuery,
  ChangeRoleDto,
  AdminListCredentialsQuery,
  AnonymizeDto,
} from "../dtos";
import type { UserUpdateInput } from "../entities/user.interface";
import type { CurrentSessionRef } from "../services/user.service";
import type { RoleCode } from "../../../core/constants";

const REFRESH_COOKIE_NAME = "refresh_token";

/** Ai được sửa field nào khi tự cập nhật hồ sơ mình (không có quyền `user:update`). */
const SELF_EDITABLE_FIELDS = ["name", "avatarAssetId"] as const;

export function createUserController(userService: UserService, avatarService: UserAvatarService) {
  const getUsers = catchAsync(async (req: Request, res: Response) => {
    const query = req.query as unknown as ListUsersQuery;
    const { page, limit, q, role, status } = query;
    const offset = (page - 1) * limit;
    const { data, total } = await userService.list({ limit, offset, q, role, status });
    const payload: PaginatedResponse<(typeof data)[0]> = {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
    ResponseUtils.paginated(res, payload, "Lấy danh sách người dùng thành công");
  });

  const getUserById = catchAsync(async (req: Request, res: Response) => {
    const user = await userService.getById(req.params.id);
    ResponseUtils.success(res, user, "Lấy thông tin người dùng thành công");
  });

  const createUser = catchAsync(async (req: Request, res: Response) => {
    const user = await userService.create(req.body);
    ResponseUtils.success(res, user, "Tạo người dùng thành công", 201);
  });

  /**
   * Tự sửa hồ sơ mình (không có `user:update`) chỉ được đổi `name`/`avatarAssetId`
   * — các field khác trong body bị bỏ qua thay vì báo lỗi, tránh leo quyền qua
   * việc gửi kèm `role`/`email`/`password` trong cùng request.
   */
  const updateUser = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const isSelf = req.params.id === req.user.id;
    const hasManagePermission = roleHasPermission(req.user.role, "user:update");

    let body = req.body as UserUpdateInput;
    if (isSelf && !hasManagePermission) {
      const filtered: UserUpdateInput = {};
      for (const field of SELF_EDITABLE_FIELDS) {
        if (body[field] !== undefined) (filtered as Record<string, unknown>)[field] = body[field];
      }
      body = filtered;
    }

    // `avatarAssetId` KHÔNG ghi thẳng repository: phải gắn/gỡ `AssetLink(USER_AVATAR)` cùng transaction (`UserAvatarService`). Làm TRƯỚC phần còn lại
    // (dễ lỗi validate nhất — asset sai/của người khác) để lỗi không để lại thay đổi hồ sơ dở dang.
    const { avatarAssetId, ...rest } = body;
    if (avatarAssetId !== undefined) await avatarService.set(req.user, req.params.id, avatarAssetId);
    const actor = { id: req.user.id, role: req.user.role };
    const user =
      Object.keys(rest).length > 0 ? await userService.update(req.params.id, rest, actor) : await userService.getById(req.params.id);
    ResponseUtils.success(res, user, "Cập nhật người dùng thành công");
  });

  /** `GET /users/:id/avatar` — 302 tới URL ký 3600 s; `Cache-Control` ngắn hơn TTL để bản cache của client không trỏ tới URL đã hết hạn. */
  const getAvatar = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const { url } = await avatarService.signedUrl(req.user, req.params.id);
    res.set("Cache-Control", "private, max-age=3000");
    res.redirect(302, url);
  });

  /** `POST /admin/users/:id/avatar/remove` — gỡ ảnh vi phạm, trả hồ sơ mới để admin vá cache. */
  const removeAvatar = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const { reason } = req.body as { reason: string };
    const removed = await avatarService.removeByAdmin(req.user, req.params.id, reason);
    const user = await userService.getById(req.params.id);
    ResponseUtils.success(res, { removed, user }, removed ? "Đã gỡ ảnh đại diện" : "Người dùng chưa đặt ảnh đại diện");
  });

  const deleteUser = catchAsync(async (req: Request, res: Response) => {
    await userService.delete(req.params.id);
    ResponseUtils.success(res, null, "Xóa người dùng thành công");
  });

  const lockUser = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const { reason } = req.body as { reason: string };
    const user = await userService.lock(req.params.id, req.user.id, reason);
    ResponseUtils.success(res, user, "Đã khoá tài khoản");
  });

  const unlockUser = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const { reason } = req.body as { reason: string };
    const user = await userService.unlock(req.params.id, req.user.id, reason);
    ResponseUtils.success(res, user, "Đã mở khoá tài khoản");
  });

  const changeRole = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const { role, reason } = req.body as ChangeRoleDto;
    const user = await userService.changeRole(req.params.id, role as RoleCode, req.user.id, reason);
    ResponseUtils.success(res, user, "Đã đổi vai trò người dùng");
  });

  const requestAnonymize = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const { reason } = req.body as { reason: string };
    const user = await userService.requestAnonymize(req.params.id, req.user.id, reason);
    ResponseUtils.success(res, user, "Đã đặt tài khoản vào trạng thái chờ xoá");
  });

  /** POST /admin/users/:id/anonymize (be.md §4/§5.5) — mode GRADE|NOW. */
  const anonymize = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const { mode, reason, confirmEmail } = req.body as AnonymizeDto;
    const result = await userService.anonymizeAdmin(
      req.params.id,
      { id: req.user.id, role: req.user.role },
      { mode, reason, confirmEmail }
    );
    ResponseUtils.success(
      res,
      result,
      mode === "NOW" ? "Đã ẩn danh hoá tài khoản" : "Đã đặt tài khoản vào trạng thái chờ xoá"
    );
  });

  /** POST /admin/users/:id/anonymize/cancel (be.md §4). */
  const anonymizeCancel = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const { reason } = req.body as { reason: string };
    const result = await userService.cancelDeletionAdmin(
      req.params.id,
      { id: req.user.id, role: req.user.role },
      reason
    );
    ResponseUtils.success(res, result, "Đã huỷ ẩn danh hoá tài khoản");
  });

  /** "Phiên hiện tại" chỉ có nghĩa khi xem/sửa phiên của CHÍNH MÌNH: `sid` của access token và/hoặc cookie. */
  function currentSessionOf(req: Request, isSelf: boolean): CurrentSessionRef | undefined {
    if (!isSelf) return undefined;
    return {
      sessionId: req.user?.sessionId,
      refreshToken: req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined,
    };
  }

  const listSessions = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const isSelf = req.params.id === req.user.id;
    // Chính chủ thấy `deviceId` đầy đủ; quản trị viên xem hộ chỉ thấy `deviceIdMasked`.
    const sessions = await userService.listSessions(
      req.params.id,
      currentSessionOf(req, isSelf),
      isSelf
    );
    ResponseUtils.success(res, sessions, "Danh sách phiên đăng nhập");
  });

  const revokeSession = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const isSelf = req.params.id === req.user.id;
    await userService.revokeSession(req.params.sid, req.params.id, currentSessionOf(req, isSelf), {
      id: req.user.id,
      role: req.user.role,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    ResponseUtils.success(res, null, "Đã thu hồi phiên đăng nhập");
  });

  /** GET /users/:id/biometric-credentials — admin (p0-13). */
  const listBiometricCredentials = catchAsync(async (req: Request, res: Response) => {
    const { status } = req.query as unknown as AdminListCredentialsQuery;
    const list = await userService.listBiometricCredentials(req.params.id, status);
    ResponseUtils.success(res, list, "Danh sách đăng nhập sinh trắc học");
  });

  /** POST /users/:id/biometric-credentials/:credentialId/revoke — admin (p0-13). */
  const revokeBiometricCredential = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const { reason } = req.body as { reason: string };
    await userService.revokeBiometricCredential(
      req.params.id,
      req.params.credentialId,
      req.user.id,
      reason
    );
    ResponseUtils.success(res, { revoked: true }, "Đã thu hồi đăng nhập sinh trắc học");
  });

  return {
    getUsers,
    getUserById,
    createUser,
    updateUser,
    getAvatar,
    removeAvatar,
    deleteUser,
    lockUser,
    unlockUser,
    changeRole,
    requestAnonymize,
    anonymize,
    anonymizeCancel,
    listSessions,
    revokeSession,
    listBiometricCredentials,
    revokeBiometricCredential,
  };
}
