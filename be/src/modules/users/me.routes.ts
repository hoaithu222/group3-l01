import { Router } from "express";
import { authenticateToken, accountActionLimiter, deleteCancelLimiter, validateBody } from "../../core/middlewares";
import { PasswordAttemptGuard } from "../../core/auth/password-attempt-guard";
import { UserAnonymizer } from "./services/user-anonymizer";
import { deleteRequestSchema, deleteCancelSchema, privacySchema, updatePhoneSchema } from "./dtos";
import { UserService } from "./services/user.service";
import { PrismaUserRepository } from "./repositories";
import { SessionService } from "../auth/services/session.service";
import { AuditService } from "../audit-log/audit-log.service";
import { createMeController } from "./controllers/me.controller";

const router = Router();

// ── DI wiring ─────────────────────────────────────────────────────────────────
const userRepo = new PrismaUserRepository();
const sessionService = new SessionService();
const auditService = new AuditService();
// Xác nhận lại mật khẩu (xoá/huỷ xoá tài khoản): cùng bộ đếm "reauth" với đổi mật khẩu/bật sinh trắc học.
const userService = new UserService(
  userRepo,
  sessionService,
  auditService,
  new UserAnonymizer(),
  new PasswordAttemptGuard("reauth")
);
const meController = createMeController(userService);

/**
 * @openapi
 * /me/delete-request:
 *   post:
 *     summary: Yêu cầu xoá tài khoản (D-02) — chuyển PENDING_DELETION, ân hạn LIMITS.deletion.graceDays ngày
 *     tags: [Users]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/delete-request",
  authenticateToken,
  accountActionLimiter,
  validateBody(deleteRequestSchema),
  meController.deleteRequest
);

/**
 * @openapi
 * /me/delete-cancel:
 *   post:
 *     summary: Huỷ yêu cầu xoá tài khoản trong thời gian ân hạn (email + password — tài khoản đang bị chặn đăng nhập)
 *     tags: [Users]
 */
router.post(
  "/delete-cancel",
  deleteCancelLimiter,
  validateBody(deleteCancelSchema),
  meController.deleteCancel
);

/**
 * @openapi
 * /me/privacy:
 *   patch:
 *     summary: Cập nhật quyền riêng tư (readReceipts, showPresence)
 *     tags: [Users]
 *     security: [{ BearerAuth: [] }]
 */
router.patch(
  "/privacy",
  authenticateToken,
  validateBody(privacySchema),
  meController.updatePrivacy
);

/**
 * @openapi
 * /me/phone:
 *   patch:
 *     summary: Đặt/đổi/xoá (phone=null) số điện thoại của mình — tự khai, chuẩn hoá E.164, chưa xác minh
 *     tags: [Users]
 *     security: [{ BearerAuth: [] }]
 */
router.patch(
  "/phone",
  authenticateToken,
  accountActionLimiter,
  validateBody(updatePhoneSchema),
  meController.updatePhone
);

export default router;
