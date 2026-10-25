import { Router } from "express";
import {
  authenticateToken,
  apiLimiter,
  idempotencyKey,
  requireFeature,
  scopeLimiter,
  validateBody,
  validateParams,
  validateQuery,
} from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { LIMITS } from "../../core/constants/limits";
import { ErrorCode } from "../../core/utils/error.codes";
import { idParamSchema } from "../../shared/dto/common-schemas";
import { createWalletContainer } from "./wallet.container";
import { requireWalletRole } from "./services/wallet-access";
import { createWalletController } from "./controllers/wallet.controller";
import {
  createAdjustmentSchema,
  createExpenseSchema,
  createSettlementSchema,
  exportQuerySchema,
  listExpensesQuerySchema,
  listSettlementsQuerySchema,
  paymentProfileSchema,
  payeeParamsSchema,
  rejectSettlementSchema,
  updateExpenseSchema,
  walletSettingsSchema,
  workspaceParamsSchema,
} from "./dtos";
import "./services/wallet-notifications";

const controller = createWalletController(createWalletContainer());

// Mọi route: đăng nhập → cờ `wallet` (tắt → 404 CFG_005) → rate limit theo user. Quyền MEMBER+/ADMIN+ do service kiểm
// (`assertWalletRole`) để GUEST/người ngoài ra 404 trung tính (IR-36) và test service không cần dựng HTTP.
const M = [authenticateToken, requireFeature(MODULES.WALLET), apiLimiter] as const;

const router = Router();
const ws = (path: string) => `/workspaces/:workspaceId/${path}`;

/**
 * @openapi
 * /workspaces/{workspaceId}/wallet:
 *   get: { summary: "Cài đặt ví nhóm (lịch nhắc, nơi đăng, walletVersion)", tags: [Wallet], security: [{ BearerAuth: [] }] }
 *   put: { summary: "Cập nhật cài đặt ví (ADMIN+, expectedVersion)", tags: [Wallet], security: [{ BearerAuth: [] }] }
 */
router.get(ws("wallet"), ...M, validateParams(workspaceParamsSchema), controller.getSettings);
router.put(ws("wallet"), ...M, validateParams(workspaceParamsSchema), validateBody(walletSettingsSchema), controller.updateSettings);

/**
 * @openapi
 * /workspaces/{workspaceId}/wallet/summary:
 *   get: { summary: "Số dư của tôi + cả nhóm + gợi ý thanh toán tối giản", tags: [Wallet], security: [{ BearerAuth: [] }] }
 */
router.get(ws("wallet/summary"), ...M, validateParams(workspaceParamsSchema), controller.getSummary);

/**
 * @openapi
 * /workspaces/{workspaceId}/wallet/payees/{userId}/payment-info:
 *   get: { summary: "Tài khoản nhận tiền của người đang được nợ (chỉ người đang nợ; có audit)", tags: [Wallet], security: [{ BearerAuth: [] }] }
 */
router.get(ws("wallet/payees/:userId/payment-info"), ...M, validateParams(payeeParamsSchema), controller.getPaymentInfo);

/**
 * @openapi
 * /workspaces/{workspaceId}/wallet/remind:
 *   post: { summary: "Nhắc nợ ngay (ADMIN+, 1 lần/giờ/nhóm)", tags: [Wallet], security: [{ BearerAuth: [] }] }
 */
router.post(
  ws("wallet/remind"),
  ...M,
  validateParams(workspaceParamsSchema),
  requireWalletRole("ADMIN"),
  scopeLimiter(
    "wallet-remind",
    (req) => req.params.workspaceId,
    [{ max: LIMITS.wallet.remindNowPerHour, windowSeconds: 3600 }],
    ErrorCode.WALLET_010
  ),
  controller.remindNow
);

/**
 * @openapi
 * /workspaces/{workspaceId}/wallet/export:
 *   get: { summary: "Tải CSV khoản chi/thanh toán (kind=expenses|settlements, tối đa 5000 dòng)", tags: [Wallet], security: [{ BearerAuth: [] }] }
 */
router.get(ws("wallet/export"), ...M, validateParams(workspaceParamsSchema), validateQuery(exportQuerySchema), controller.exportCsv);

/**
 * @openapi
 * /workspaces/{workspaceId}/expenses:
 *   get: { summary: "Danh sách khoản chi (cursor) kèm myShare", tags: [Wallet], security: [{ BearerAuth: [] }] }
 *   post: { summary: "Ghi khoản chi (Idempotency-Key)", tags: [Wallet], security: [{ BearerAuth: [] }] }
 */
router.get(ws("expenses"), ...M, validateParams(workspaceParamsSchema), validateQuery(listExpensesQuerySchema), controller.listExpenses);
router.post(
  ws("expenses"),
  ...M,
  validateParams(workspaceParamsSchema),
  idempotencyKey("expense"),
  validateBody(createExpenseSchema),
  controller.createExpense
);

/**
 * @openapi
 * /expenses/{id}:
 *   get: { summary: "Chi tiết khoản chi + phần chia + điều chỉnh", tags: [Wallet], security: [{ BearerAuth: [] }] }
 *   patch: { summary: "Sửa (khi chưa ai trả — WALLET_004)", tags: [Wallet], security: [{ BearerAuth: [] }] }
 *   delete: { summary: "Xoá mềm (khi chưa ai trả — WALLET_004)", tags: [Wallet], security: [{ BearerAuth: [] }] }
 */
router.get("/expenses/:id", ...M, validateParams(idParamSchema), controller.getExpense);
router.patch("/expenses/:id", ...M, validateParams(idParamSchema), validateBody(updateExpenseSchema), controller.updateExpense);
router.delete("/expenses/:id", ...M, validateParams(idParamSchema), controller.removeExpense);
router.post("/expenses/:id/adjustments", ...M, validateParams(idParamSchema), validateBody(createAdjustmentSchema), controller.adjustExpense);

/**
 * @openapi
 * /workspaces/{workspaceId}/settlements:
 *   get: { summary: "Danh sách thanh toán (cursor, status, mine)", tags: [Wallet], security: [{ BearerAuth: [] }] }
 *   post: { summary: "Báo đã trả (PENDING; Idempotency-Key; 20/giờ/người)", tags: [Wallet], security: [{ BearerAuth: [] }] }
 */
router.get(ws("settlements"), ...M, validateParams(workspaceParamsSchema), validateQuery(listSettlementsQuerySchema), controller.listSettlements);
router.post(
  ws("settlements"),
  ...M,
  validateParams(workspaceParamsSchema),
  idempotencyKey("settlement"),
  scopeLimiter("wallet-settlement", (req) => req.user?.id ?? null, [{ max: LIMITS.wallet.settlementCreatePerHour, windowSeconds: 3600 }]),
  validateBody(createSettlementSchema),
  controller.createSettlement
);

/**
 * @openapi
 * /settlements/{id}/confirm:
 *   post: { summary: "Người nhận xác nhận (chỉ khi PENDING — WALLET_007; kiểm lại hạn mức — WALLET_005)", tags: [Wallet], security: [{ BearerAuth: [] }] }
 * /settlements/{id}/reject:
 *   post: { summary: "Người nhận từ chối kèm lý do (chỉ khi PENDING — WALLET_007)", tags: [Wallet], security: [{ BearerAuth: [] }] }
 * /settlements/{id}/cancel:
 *   post: { summary: "Người gửi huỷ (chỉ khi PENDING — WALLET_007)", tags: [Wallet], security: [{ BearerAuth: [] }] }
 */
router.post("/settlements/:id/confirm", ...M, validateParams(idParamSchema), controller.confirmSettlement);
router.post("/settlements/:id/reject", ...M, validateParams(idParamSchema), validateBody(rejectSettlementSchema), controller.rejectSettlement);
router.post("/settlements/:id/cancel", ...M, validateParams(idParamSchema), controller.cancelSettlement);

/**
 * @openapi
 * /me/payment-profiles:
 *   get: { summary: "Tài khoản nhận tiền của tôi (chỉ 4 số cuối)", tags: [Wallet], security: [{ BearerAuth: [] }] }
 *   post: { summary: "Thêm tài khoản (tối đa 3 — WALLET_009)", tags: [Wallet], security: [{ BearerAuth: [] }] }
 * /me/payment-profiles/{id}/default:
 *   post: { summary: "Đặt tài khoản mặc định", tags: [Wallet], security: [{ BearerAuth: [] }] }
 * /me/payment-profiles/{id}:
 *   delete: { summary: "Xoá tài khoản (hồ sơ còn lại lên mặc định)", tags: [Wallet], security: [{ BearerAuth: [] }] }
 */
router.get("/me/payment-profiles", ...M, controller.listProfiles);
router.post("/me/payment-profiles", ...M, validateBody(paymentProfileSchema), controller.createProfile);
router.post("/me/payment-profiles/:id/default", ...M, validateParams(idParamSchema), controller.setDefaultProfile);
router.delete("/me/payment-profiles/:id", ...M, validateParams(idParamSchema), controller.removeProfile);

export default router;
