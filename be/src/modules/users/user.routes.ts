import { Router } from "express";
import { createUserController } from "./controllers/user.controller";
import {
  validateBody,
  validateParams,
  validateQuery,
  authenticateToken,
  requireRoles,
  requirePermission,
  requireSelfOrPermission,
} from "../../core/middlewares";
import { ROLES } from "../../core/constants";
import { idParamSchema, objectIdSchema, reasonSchema } from "../../shared/dto/common-schemas";
import { z } from "zod";
import {
  createUserSchema,
  updateUserSchema,
  listUsersQuerySchema,
  changeRoleSchema,
  adminCredentialParamsSchema,
  adminListCredentialsQuerySchema,
  adminRevokeBiometricSchema,
  anonymizeSchema,
} from "./dtos";
import { UserService } from "./services/user.service";
import { UserAvatarService } from "./services/user-avatar.service";
import { createAssetLinkService, createAssetUrlService } from "../assets/public";
import { PrismaUserRepository } from "./repositories";
import { SessionService } from "../auth/services/session.service";
import { AuditService } from "../audit-log/audit-log.service";

const router = Router();

/** `sid` là ObjectId — id lạ làm Prisma ném lỗi "Malformed ObjectID" (500) thay vì 400/404. */
const sessionParamsSchema = z.object({ id: objectIdSchema, sid: objectIdSchema });

// ── DI wiring ─────────────────────────────────────────────────────────────────
const userRepo = new PrismaUserRepository();
const sessionService = new SessionService();
const auditService = new AuditService();
const userService = new UserService(userRepo, sessionService, auditService);
const avatarService = new UserAvatarService(userRepo, createAssetLinkService(), createAssetUrlService(), auditService);
const userController = createUserController(userService, avatarService);

router.use(authenticateToken);

/**
 * @openapi
 * /users:
 *   get:
 *     summary: Danh sách người dùng (admin/manager)
 *     tags: [Users]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/",
  requirePermission("user:view"),
  validateQuery(listUsersQuerySchema),
  userController.getUsers
);

/**
 * @openapi
 * /users:
 *   post:
 *     summary: Tạo người dùng mới (admin/manager)
 *     tags: [Users]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/",
  requirePermission("user:create"),
  validateBody(createUserSchema),
  userController.createUser
);

/**
 * @openapi
 * /users/{id}:
 *   get:
 *     summary: Xem hồ sơ người dùng (chính mình hoặc có quyền user:view)
 *     tags: [Users]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/:id",
  validateParams(idParamSchema),
  requireSelfOrPermission("id", "user:view"),
  userController.getUserById
);

/**
 * @openapi
 * /users/{id}:
 *   patch:
 *     summary: Cập nhật hồ sơ (chính mình chỉ sửa name/avatarAssetId, admin/manager sửa toàn bộ)
 *     tags: [Users]
 *     security: [{ BearerAuth: [] }]
 */
router.patch(
  "/:id",
  validateParams(idParamSchema),
  requireSelfOrPermission("id", "user:update"),
  validateBody(updateUserSchema),
  userController.updateUser
);

/**
 * @openapi
 * /users/{id}/avatar:
 *   get:
 *     summary: Ảnh đại diện — 302 tới URL ký 3600 s (mọi người dùng đăng nhập; 404 khi chưa đặt ảnh)
 *     description: |
 *       Đặt/gỡ ảnh bằng `PATCH /users/{id}` `{ avatarAssetId }`. Endpoint cần Bearer, giữ cho tương thích — client hiển thị
 *       ảnh bằng `AuthUserDto.avatar`/`avatarUrl` (URL ký sẵn `GET /assets/{assetId}/image`, không cần Bearer).
 *     tags: [Users]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       302: { description: "Chuyển hướng tới URL ký của ảnh" }
 *       404: { description: "Chưa đặt ảnh đại diện / không có người dùng" }
 */
router.get("/:id/avatar", validateParams(idParamSchema), userController.getAvatar);

/**
 * @openapi
 * /admin/users/{id}/avatar/remove:
 *   post:
 *     summary: Gỡ ảnh đại diện vi phạm (quản trị, bắt buộc lý do, ghi audit `user.avatar-remove`)
 *     description: 'Trả `{ removed, user }` — `removed: false` khi người dùng chưa đặt ảnh. Mount cả ở `/users/{id}/avatar/remove` (cùng router).'
 *     tags: [Users]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/:id/avatar/remove",
  requirePermission("user:update"),
  validateParams(idParamSchema),
  validateBody(reasonSchema),
  userController.removeAvatar
);

/**
 * @openapi
 * /users/{id}/lock:
 *   post:
 *     summary: Khoá tài khoản — thu hồi mọi session (D-11)
 *     tags: [Users]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/:id/lock",
  requirePermission("user:update"),
  validateParams(idParamSchema),
  validateBody(reasonSchema),
  userController.lockUser
);

/**
 * @openapi
 * /users/{id}/unlock:
 *   post:
 *     summary: Mở khoá tài khoản
 *     tags: [Users]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/:id/unlock",
  requirePermission("user:update"),
  validateParams(idParamSchema),
  validateBody(reasonSchema),
  userController.unlockUser
);

/**
 * @openapi
 * /users/{id}/role:
 *   patch:
 *     summary: Đổi vai trò — chỉ admin, không tự đổi vai trò của chính mình
 *     tags: [Users]
 *     security: [{ BearerAuth: [] }]
 */
router.patch(
  "/:id/role",
  requirePermission("user:update"),
  requireRoles([ROLES.ADMIN]),
  validateParams(idParamSchema),
  validateBody(changeRoleSchema),
  userController.changeRole
);

/**
 * @openapi
 * /users/{id}/sessions:
 *   get:
 *     summary: Danh sách phiên đăng nhập (chính mình hoặc có quyền user:view)
 *     tags: [Users]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/:id/sessions",
  requireSelfOrPermission("id", "user:view"),
  validateParams(idParamSchema),
  userController.listSessions
);

/**
 * @openapi
 * /users/{id}/sessions/{sid}:
 *   delete:
 *     summary: Thu hồi 1 phiên đăng nhập (chính mình hoặc có quyền user:update)
 *     tags: [Users]
 *     security: [{ BearerAuth: [] }]
 */
router.delete(
  "/:id/sessions/:sid",
  validateParams(sessionParamsSchema),
  requireSelfOrPermission("id", "user:update"),
  userController.revokeSession
);

/**
 * @openapi
 * /users/{id}:
 *   delete:
 *     summary: (Deprecated) Yêu cầu xoá tài khoản (D-02, chế độ GRACE) — chỉ admin
 *     deprecated: true
 *     description: 'Dùng `POST /admin/users/{id}/anonymize` với `mode: "GRACE"` thay thế — endpoint này giữ lại làm alias tương thích ngược (be.md p0-01 §4), không có ân hạn/outbox/mail đầy đủ như endpoint mới.'
 *     tags: [Users]
 *     security: [{ BearerAuth: [] }]
 */
router.delete(
  "/:id",
  requireRoles([ROLES.ADMIN]),
  validateParams(idParamSchema),
  validateBody(reasonSchema),
  userController.requestAnonymize
);

/**
 * @openapi
 * /users/{id}/anonymize:
 *   post:
 *     summary: Ẩn danh hoá tài khoản — mode GRACE (đặt lịch, có ân hạn) hoặc NOW (ngay lập tức, chỉ admin + xác nhận email)
 *     tags: [Users]
 *     security: [{ BearerAuth: [] }]
 *
 * # Mount thêm ở `/admin/users/:id/anonymize` (xem `router.ts`) — cùng router,
 * # be.md p0-01 §1/§4 đặt endpoint chính dưới namespace `/admin/users`.
 */
router.post(
  "/:id/anonymize",
  requirePermission("user:delete"),
  validateParams(idParamSchema),
  validateBody(anonymizeSchema),
  userController.anonymize
);

/**
 * @openapi
 * /users/{id}/anonymize/cancel:
 *   post:
 *     summary: Huỷ ẩn danh hoá đang chờ (mode GRACE) — admin
 *     tags: [Users]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/:id/anonymize/cancel",
  requirePermission("user:delete"),
  validateParams(idParamSchema),
  validateBody(reasonSchema),
  userController.anonymizeCancel
);

/**
 * @openapi
 * /users/{id}/biometric-credentials:
 *   get:
 *     summary: (Admin, p0-13) Danh sách đăng nhập sinh trắc học của 1 user
 *     tags: [Users]
 *     security: [{ BearerAuth: [] }]
 *
 * # NOTE: be.md đặt endpoint này ở `/admin/users/:id/biometric-credentials` —
 * # repo hiện chưa có router `/admin/users` riêng (thuộc phạm vi p0-01, ngoài
 * # scope task này) nên mount tạm dưới `/users/:id/biometric-credentials`.
 * # Xem báo cáo cuối cùng của task.
 */
router.get(
  "/:id/biometric-credentials",
  requirePermission("user:view"),
  validateParams(idParamSchema),
  validateQuery(adminListCredentialsQuerySchema),
  userController.listBiometricCredentials
);

/**
 * @openapi
 * /users/{id}/biometric-credentials/{credentialId}/revoke:
 *   post:
 *     summary: (Admin, p0-13) Thu hồi 1 đăng nhập sinh trắc học của user
 *     tags: [Users]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/:id/biometric-credentials/:credentialId/revoke",
  requirePermission("user:update"),
  validateParams(adminCredentialParamsSchema),
  validateBody(adminRevokeBiometricSchema),
  userController.revokeBiometricCredential
);

export default router;
