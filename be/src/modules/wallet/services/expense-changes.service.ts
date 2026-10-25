import { withTransaction } from "../../../infrastructure/database";
import { ScopeForbiddenError, ScopeNotFoundError, ValidationError, VersionConflictError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { AuthUser } from "../../../core/types/express";
import { notify } from "../../notifications/public";
import type { AssetLinkService } from "../../assets/public";
import { splitExpense, type Share } from "../domain/wallet-math";
import type { Expense, ExpenseDetailView } from "../entities/wallet.interface";
import type { CreateAdjustmentDto, UpdateExpenseDto } from "../dtos";
import type { IExpenseRepository } from "../repositories/expense.repository.interface";
import type { IWalletDirectory, WalletMemberRole } from "../repositories/wallet-directory.interface";
import type { IWalletRepository, Tx } from "../repositories/wallet.repository.interface";
import { assertWalletRole, assertWorkspaceWritable, isWalletAdmin } from "./wallet-access";
import {
  assertActiveMembers,
  assertAssetReady,
  assertSplitConsistent,
  deltasOfShares,
  normalizeDescription,
  toParticipantRows,
  toShareRows,
  walletError,
} from "./expense-helpers";
import type { ExpensesService } from "./expenses.service";
import type { WalletProjectionService } from "./wallet-projection.service";
import { emitWalletUpdated, getWalletLimits } from "./wallet-support";

interface Loaded {
  expense: Expense;
  role: WalletMemberRole;
}

/** Sửa/xoá/điều chỉnh khoản chi (be.md §5 "Sửa/xoá khoản chi") — chỉ khi chưa ai trả; ngược lại phải tạo khoản điều chỉnh. */
export class ExpenseChangesService {
  constructor(
    private readonly expenseRepo: IExpenseRepository,
    private readonly walletRepo: IWalletRepository,
    private readonly directory: IWalletDirectory,
    private readonly projection: WalletProjectionService,
    private readonly assetLink: AssetLinkService,
    private readonly expenses: ExpensesService
  ) {}

  async update(actor: AuthUser, expenseId: string, dto: UpdateExpenseDto): Promise<ExpenseDetailView> {
    const { expense, role } = await this.loadManageable(actor, expenseId);
    if (expense.kind !== "EXPENSE") throw new ValidationError("Không thể sửa khoản điều chỉnh");
    if (dto.expectedVersion !== expense.version) throw new VersionConflictError(expense.version);
    if ((dto.splitType !== undefined) !== (dto.participants !== undefined)) {
      throw new ValidationError("Đổi cách chia phải gửi kèm danh sách người tham gia");
    }

    const merged = {
      amount: dto.amount ?? expense.amount,
      description: dto.description ?? expense.description,
      category: dto.category ?? expense.category,
      paidBy: dto.paidBy ?? expense.paidBy,
      splitType: dto.splitType ?? expense.splitType,
      participants: dto.participants ?? expense.participants.map((p) => ({ userId: p.userId, amount: p.amount ?? undefined, bps: p.bps ?? undefined })),
      receiptAssetId: dto.receiptAssetId === undefined ? expense.receiptAssetId : dto.receiptAssetId,
      occurredAt: dto.occurredAt ?? expense.occurredAt,
    };
    assertSplitConsistent(merged, await getWalletLimits());
    await assertActiveMembers(this.directory, expense.workspaceId, [merged.paidBy, ...merged.participants.map((p) => p.userId)]);
    if (merged.receiptAssetId !== expense.receiptAssetId) await assertAssetReady(this.directory, merged.receiptAssetId, actor.id);
    const newShares = splitExpense(merged);
    await this.walletRepo.ensureBalances(expense.workspaceId, [merged.paidBy, ...merged.participants.map((p) => p.userId)]);

    await withTransaction(async (tx) => {
      const oldShares = await this.assertUntouched(expenseId, tx);
      const updated = await this.expenseRepo.update(
        expenseId,
        dto.expectedVersion,
        {
          amount: merged.amount,
          description: merged.description,
          normalizedDescription: normalizeDescription(merged.description),
          category: merged.category,
          paidBy: merged.paidBy,
          splitType: merged.splitType,
          participants: toParticipantRows(merged.participants),
          receiptAssetId: merged.receiptAssetId,
          occurredAt: merged.occurredAt,
        },
        tx
      );
      if (!updated) {
        const current = await this.expenseRepo.findById(expenseId, tx);
        if (!current || current.deletedAt) throw new ScopeNotFoundError();
        throw new VersionConflictError(current.version);
      }

      await this.expenseRepo.deleteShares(expenseId, tx);
      await this.expenseRepo.createShares(toShareRows(expenseId, expense.workspaceId, newShares, merged.occurredAt), tx);
      const result = await this.projection.apply(
        tx,
        expense.workspaceId,
        [...deltasOfShares(oldShares, -1), ...deltasOfShares(newShares, 1)],
        [...oldShares, ...newShares].map((s) => s.debtorId)
      );

      if (merged.receiptAssetId !== expense.receiptAssetId) {
        if (merged.receiptAssetId) {
          await this.assetLink.replace(tx, {
            targetType: "EXPENSE_RECEIPT",
            targetId: expenseId,
            assetId: merged.receiptAssetId,
            scopeType: "WORKSPACE",
            scopeId: expense.workspaceId,
            actorId: actor.id,
          });
        } else {
          await this.assetLink.detachAll(tx, { targetType: "EXPENSE_RECEIPT", targetId: expenseId });
        }
      }
      await emitWalletUpdated(tx, expense.workspaceId, result, "EXPENSE");
    });

    return this.expenses.detail(actor, expenseId, isWalletAdmin(role));
  }

  async remove(actor: AuthUser, expenseId: string): Promise<void> {
    const { expense } = await this.loadManageable(actor, expenseId);
    if (expense.kind !== "EXPENSE") throw new ValidationError("Không thể xoá khoản điều chỉnh");

    await withTransaction(async (tx) => {
      const shares = await this.assertUntouched(expenseId, tx);
      if (!(await this.expenseRepo.softDelete(expenseId, actor.id, tx))) throw new ScopeNotFoundError();
      // VOID TRƯỚC khi chiếu lại để phép chiếu bỏ qua các share này.
      await this.expenseRepo.voidShares(expenseId, tx);
      const result = await this.projection.apply(tx, expense.workspaceId, deltasOfShares(shares, -1));
      await emitWalletUpdated(tx, expense.workspaceId, result, "EXPENSE");
    });
  }

  /**
   * Khoản điều chỉnh: client gửi bản khai ĐÚNG mới của cả khoản; server tính chênh lệch từng người so với
   * hiệu lực hiện tại (gốc + các điều chỉnh trước) và ghi chênh lệch thành share (có thể âm) — không viết lại lịch sử đã trả.
   */
  async adjust(actor: AuthUser, expenseId: string, dto: CreateAdjustmentDto): Promise<ExpenseDetailView> {
    const { expense, role } = await this.loadManageable(actor, expenseId);
    if (expense.kind !== "EXPENSE") throw new ValidationError("Không thể điều chỉnh một khoản điều chỉnh");

    const input = { amount: dto.amount, splitType: dto.splitType, participants: dto.participants, paidBy: expense.paidBy };
    assertSplitConsistent(input, await getWalletLimits());
    await assertActiveMembers(this.directory, expense.workspaceId, dto.participants.map((p) => p.userId));
    const target = new Map(splitExpense(input).map((s) => [s.debtorId, s.amount]));
    await this.walletRepo.ensureBalances(expense.workspaceId, [expense.paidBy, ...dto.participants.map((p) => p.userId)]);
    const workspaceName = await this.directory.workspaceName(expense.workspaceId);

    const adjustmentId = await withTransaction(async (tx) => {
      const adjustments = await this.expenseRepo.listAdjustments(expenseId, tx);
      const effective = new Map<string, number>();
      for (const s of await this.expenseRepo.listSharesForExpenses([expenseId, ...adjustments.map((a) => a.id)], tx)) {
        if (s.status !== "VOID") effective.set(s.debtorId, (effective.get(s.debtorId) ?? 0) + s.amount);
      }

      const deltaShares: Share[] = [];
      for (const debtorId of new Set([...effective.keys(), ...target.keys()])) {
        const diff = (target.get(debtorId) ?? 0) - (effective.get(debtorId) ?? 0);
        if (diff !== 0) deltaShares.push({ debtorId, creditorId: expense.paidBy, amount: diff });
      }
      if (deltaShares.length === 0) throw new ValidationError("Không có thay đổi so với khoản chi hiện tại");

      const effectiveAmount = expense.amount + adjustments.reduce((sum, a) => sum + a.amount, 0);
      const occurredAt = new Date();
      const adjustment = await this.expenseRepo.create(
        {
          workspaceId: expense.workspaceId,
          kind: "ADJUSTMENT",
          adjustsExpenseId: expense.id,
          amount: dto.amount - effectiveAmount,
          description: dto.description,
          normalizedDescription: normalizeDescription(dto.description),
          category: expense.category,
          paidBy: expense.paidBy,
          splitType: dto.splitType,
          participants: toParticipantRows(dto.participants),
          receiptAssetId: null,
          occurredAt,
          createdBy: actor.id,
        },
        tx
      );
      await this.expenseRepo.createShares(toShareRows(adjustment.id, expense.workspaceId, deltaShares, occurredAt), tx);
      const result = await this.projection.apply(tx, expense.workspaceId, deltasOfShares(deltaShares));

      await notify(tx, {
        type: "wallet.expense-added",
        actorId: actor.id,
        scope: { type: "WORKSPACE", id: expense.workspaceId },
        workspaceId: expense.workspaceId,
        source: { type: "wallet-expense", id: adjustment.id },
        refs: { workspaceId: expense.workspaceId, expenseId: adjustment.id, workspaceName: workspaceName ?? undefined },
        recipients: deltaShares.map((s) => ({ userId: s.debtorId })),
        dedupeKey: `wallet.expense-added:${adjustment.id}:v${adjustment.version}`,
      });
      await emitWalletUpdated(tx, expense.workspaceId, result, "EXPENSE");
      return adjustment.id;
    });

    return this.expenses.detail(actor, adjustmentId, isWalletAdmin(role));
  }

  /** Người tạo hoặc ADMIN+ (README §6); nhóm lưu trữ → chỉ đọc. */
  private async loadManageable(actor: AuthUser, expenseId: string): Promise<Loaded> {
    const expense = await this.expenseRepo.findById(expenseId);
    if (!expense || expense.deletedAt) throw new ScopeNotFoundError();
    const role = await assertWalletRole(actor, expense.workspaceId);
    if (!isWalletAdmin(role) && expense.createdBy !== actor.id) {
      throw new ScopeForbiddenError(ErrorMessages[ErrorCode.PERM_001], ErrorCode.PERM_001);
    }
    await assertWorkspaceWritable(this.directory, expense.workspaceId);
    return { expense, role };
  }

  /** WALLET_004: đã có người thanh toán (`paidAmount ≠ 0`) hoặc đã có điều chỉnh → không sửa/xoá được nữa. */
  private async assertUntouched(expenseId: string, tx: Tx): Promise<Share[]> {
    const shares = await this.expenseRepo.listShares(expenseId, tx);
    const hasAdjustments = (await this.expenseRepo.listAdjustments(expenseId, tx)).length > 0;
    if (hasAdjustments || shares.some((s) => s.paidAmount !== 0)) throw walletError(ErrorCode.WALLET_004, 409);
    return shares;
  }
}
