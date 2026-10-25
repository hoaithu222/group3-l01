import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { WalletContainer } from "../wallet.container";
import type { ListExpensesQueryDto, ListSettlementsQueryDto, WalletSettingsDto, PaymentProfileDto } from "../dtos";
import type { CreateAdjustmentDto, CreateExpenseDto, CreateSettlementDto, RejectSettlementDto, UpdateExpenseDto } from "../dtos";
import type { ExportKind } from "../services/wallet-export.service";

const actor = (req: Request) => req.user!;

/** Controller factory (api-patterns.md) — chỉ parse request, gọi service, trả response. */
export function createWalletController(c: WalletContainer) {
  // ── Ví: cài đặt, tổng quan, nhắc, xuất ─────────────────────────────────────
  const getSettings = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.settings.get(actor(req), req.params.workspaceId));
  });
  const updateSettings = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.settings.update(actor(req), req.params.workspaceId, req.body as WalletSettingsDto), "Đã cập nhật ví");
  });
  const getSummary = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.summary.summary(actor(req), req.params.workspaceId));
  });
  const remindNow = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.settings.remindNow(actor(req), req.params.workspaceId), "Đã gửi nhắc nợ");
  });
  const exportCsv = catchAsync(async (req: Request, res: Response) => {
    const kind = (req.query.kind as ExportKind | undefined) ?? "expenses";
    const file = await c.exporter.export(actor(req), req.params.workspaceId, kind);
    // Tải tệp, không phải envelope JSON — ngoại lệ có chủ đích của "mọi response qua ResponseUtils".
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(file.csv);
  });

  // ── Khoản chi ─────────────────────────────────────────────────────────────
  const listExpenses = catchAsync(async (req: Request, res: Response) => {
    const page = await c.expenses.list(actor(req), req.params.workspaceId, req.query as unknown as ListExpensesQueryDto);
    ResponseUtils.cursor(res, { data: page.data, meta: { nextCursor: page.nextCursor, hasMore: page.hasMore, limit: page.limit } });
  });
  const createExpense = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.expenses.create(actor(req), req.params.workspaceId, req.body as CreateExpenseDto), "Đã ghi khoản chi", 201);
  });
  const getExpense = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.expenses.get(actor(req), req.params.id));
  });
  const updateExpense = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.expenseChanges.update(actor(req), req.params.id, req.body as UpdateExpenseDto), "Đã cập nhật khoản chi");
  });
  const removeExpense = catchAsync(async (req: Request, res: Response) => {
    await c.expenseChanges.remove(actor(req), req.params.id);
    ResponseUtils.success(res, null, "Đã xoá khoản chi");
  });
  const adjustExpense = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.expenseChanges.adjust(actor(req), req.params.id, req.body as CreateAdjustmentDto), "Đã tạo khoản điều chỉnh", 201);
  });

  // ── Settlement ────────────────────────────────────────────────────────────
  const listSettlements = catchAsync(async (req: Request, res: Response) => {
    const page = await c.settlements.list(actor(req), req.params.workspaceId, req.query as unknown as ListSettlementsQueryDto);
    ResponseUtils.cursor(res, { data: page.data, meta: { nextCursor: page.nextCursor, hasMore: page.hasMore, limit: page.limit } });
  });
  const createSettlement = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.settlements.create(actor(req), req.params.workspaceId, req.body as CreateSettlementDto), "Đã ghi nhận thanh toán", 201);
  });
  const confirmSettlement = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.settlements.confirm(actor(req), req.params.id), "Đã xác nhận");
  });
  const rejectSettlement = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.settlements.reject(actor(req), req.params.id, (req.body as RejectSettlementDto).reason), "Đã từ chối");
  });
  const cancelSettlement = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.settlements.cancel(actor(req), req.params.id), "Đã huỷ");
  });

  // ── Tài khoản nhận tiền ───────────────────────────────────────────────────
  const getPaymentInfo = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.profiles.getPayeeInfo(actor(req), req.params.workspaceId, req.params.userId));
  });
  const listProfiles = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.profiles.list(actor(req).id));
  });
  const createProfile = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.profiles.create(actor(req).id, req.body as PaymentProfileDto), "Đã thêm tài khoản", 201);
  });
  const setDefaultProfile = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.profiles.setDefault(actor(req).id, req.params.id), "Đã đặt mặc định");
  });
  const removeProfile = catchAsync(async (req: Request, res: Response) => {
    await c.profiles.remove(actor(req).id, req.params.id);
    ResponseUtils.success(res, null, "Đã xoá tài khoản");
  });

  return {
    getSettings, updateSettings, getSummary, remindNow, exportCsv,
    listExpenses, createExpense, getExpense, updateExpense, removeExpense, adjustExpense,
    listSettlements, createSettlement, confirmSettlement, rejectSettlement, cancelSettlement,
    getPaymentInfo, listProfiles, createProfile, setDefaultProfile, removeProfile,
  };
}
