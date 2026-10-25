import { Router } from "express";
import {
  authenticateToken,
  requireFeature,
  validateQuery,
  validateBody,
  validateParams,
} from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { permissionService, requireWorkspaceRole, type Action, type ScopeType } from "../../core/permission";
import { idParamSchema } from "../../shared/dto/common-schemas";
import { invalidateUnreadSummary } from "../read-state/public";
import { NotificationService } from "./services/notification.service";
import { NotificationPreferenceService } from "./services/notification-preference.service";
import { InboxContextService } from "./services/inbox-context.service";
import { messageDefaultsLoader } from "./services/notification-defaults";
import { PrismaNotificationRepository } from "./repositories";
import { PrismaInboxContextRepository } from "./repositories/inbox-context.repository.prisma";
import { createNotificationController } from "./controllers/notification.controller";
import {
  listNotificationsQuerySchema,
  readAllSchema,
  unreadCountQuerySchema,
} from "./dtos/list-notifications.dto";
import { getPreferenceQuerySchema, preferenceBodySchema } from "./dtos/preference.dto";
import { workspacePreferenceSchema } from "./dtos/account-preference.dto";
import "./services/notification-types"; // side-effect: registerBuiltinNotificationTypes()

const router = Router();

const repo = new PrismaNotificationRepository();

const READ_ACTION: Record<"CHANNEL" | "CONVERSATION", Action> = { CHANNEL: "channel.read", CONVERSATION: "conversation.read" };
const inboxContext = new InboxContextService({
  repo: new PrismaInboxContextRepository(),
  canRead: (userId, scopeType, scopeId) =>
    permissionService.can({ id: userId, email: "" }, READ_ACTION[scopeType], { type: scopeType as ScopeType, id: scopeId }),
});
const service = new NotificationService(repo, {
  enrich: (userId, items) => inboxContext.enrich(userId, items),
  inboxChanged: (userId) => invalidateUnreadSummary([userId]),
});
const preferenceService = new NotificationPreferenceService(repo, messageDefaultsLoader);
const controller = createNotificationController(service, preferenceService);

router.use(authenticateToken);

/**
 * @openapi
 * /notifications:
 *   get:
 *     summary: Inbox thông báo (cursor pagination, lọc all|mentions|following|calls|meetings)
 *     tags: [Notifications]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/notifications", validateQuery(listNotificationsQuerySchema), controller.listInbox);

/**
 * @openapi
 * /notifications/unread-count:
 *   get:
 *     summary: Tổng số thông báo chưa đọc + chia theo bộ lọc
 *     tags: [Notifications]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/notifications/unread-count", validateQuery(unreadCountQuerySchema), controller.unreadCount);

/**
 * @openapi
 * /notifications/read-all:
 *   post:
 *     summary: Đánh dấu tất cả đã đọc theo bộ lọc
 *     tags: [Notifications]
 *     security: [{ BearerAuth: [] }]
 */
router.post("/notifications/read-all", validateBody(readAllSchema), controller.markAllRead);

/**
 * @openapi
 * /notifications/{id}/read:
 *   post:
 *     summary: Đánh dấu 1 thông báo đã đọc
 *     tags: [Notifications]
 *     security: [{ BearerAuth: [] }]
 */
router.post("/notifications/:id/read", validateParams(idParamSchema), controller.markRead);

/**
 * @openapi
 * /me/notification-preferences:
 *   get:
 *     summary: Tuỳ chọn thông báo theo scope (ACCOUNT/WORKSPACE/CHANNEL/CONVERSATION)
 *     tags: [Notifications]
 *     security: [{ BearerAuth: [] }]
 *   put:
 *     summary: Cập nhật tuỳ chọn thông báo (scope ≠ ACCOUNT cần quyền đọc scope đó)
 *     tags: [Notifications]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/me/notification-preferences", validateQuery(getPreferenceQuerySchema), controller.getPreference);
router.put("/me/notification-preferences", validateBody(preferenceBodySchema), controller.updatePreference);

/**
 * @openapi
 * /workspaces/{id}/notification-preferences:
 *   get:
 *     summary: Cài đặt thông báo của tôi cho 1 nhóm làm việc (groupMode/channelMode, INHERIT = theo tài khoản)
 *     tags: [Notifications]
 *     security: [{ BearerAuth: [] }]
 *   put:
 *     summary: Đổi cài đặt thông báo của tôi cho 1 nhóm làm việc
 *     tags: [Notifications]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/workspaces/:id/notification-preferences",
  requireFeature(MODULES.COMMUNICATION),
  validateParams(idParamSchema),
  requireWorkspaceRole("MEMBER", "id"),
  controller.getWorkspacePreference
);
router.put(
  "/workspaces/:id/notification-preferences",
  requireFeature(MODULES.COMMUNICATION),
  validateParams(idParamSchema),
  requireWorkspaceRole("MEMBER", "id"),
  validateBody(workspacePreferenceSchema),
  controller.updateWorkspacePreference
);

export default router;
export { controller as notificationController };
