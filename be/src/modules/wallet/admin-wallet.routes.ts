import { Router } from "express";
import type { Request, Response } from "express";
import { authenticateToken, requireFeature, requirePermission, validateParams } from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { catchAsync } from "../../core/utils/catchAsync";
import { ResponseUtils } from "../../core/utils/response";
import { createWalletContainer } from "./wallet.container";
import { workspaceParamsSchema } from "./dtos";

const { stats } = createWalletContainer();
const router = Router();

/**
 * @openapi
 * /admin/workspaces/{workspaceId}/wallet-stats:
 *   get:
 *     summary: Thống kê ví ẨN DANH cho admin (chỉ đếm + dải giá trị — không userId/số tiền chính xác)
 *     tags: [Admin/Wallet]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/admin/workspaces/:workspaceId/wallet-stats",
  authenticateToken,
  requireFeature(MODULES.WALLET),
  requirePermission("workspace:view"),
  validateParams(workspaceParamsSchema),
  catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await stats.stats(req.params.workspaceId));
  })
);

export default router;
