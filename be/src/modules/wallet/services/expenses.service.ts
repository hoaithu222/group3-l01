import { withTransaction } from "../../../infrastructure/database";
import { ScopeNotFoundError, ValidationError } from "../../../core/exceptions";
import { decodeCursor, encodeCursor } from "../../../core/utils/cursor";
import type { AuthUser } from "../../../core/types/express";
import { notify } from "../../notifications/public";
import type { AssetLinkService } from "../../assets/public";
import { splitExpense } from "../domain/wallet-math";
import type { ExpenseDetailView, ExpenseView } from "../entities/wallet.interface";
import type { ListExpensesQueryDto, CreateExpenseDto } from "../dtos";
import type { IExpenseRepository } from "../repositories/expense.repository.interface";
import type { IWalletDirectory } from "../repositories/wallet-directory.interface";
import type { IWalletRepository } from "../repositories/wallet.repository.interface";
import "./wallet-notifications";
import { assertWalletRole, assertWorkspaceWritable, isWalletAdmin } from "./wallet-access";
import {
  assertActiveMembers,
  assertAssetReady,
  assertSplitConsistent,
  deltasOfShares,
  normalizeDescription,
  toParticipantRows,
  toShareRows,
} from "./expense-helpers";
import { toExpenseDetailView, toExpenseView } from "./wallet-presenter";
import type { WalletProjectionService } from "./wallet-projection.service";
import { emitWalletUpdated, getWalletLimits } from "./wallet-support";

export interface CursorPage<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

/** Tạo/đọc khoản chi (be.md §5) — sửa/xoá/điều chỉnh ở `ExpenseChangesService`. */
export class ExpensesService {
  constructor(
    private readonly expenseRepo: IExpenseRepository,
    private readonly walletRepo: IWalletRepository,
    private readonly directory: IWalletDirectory,
    private readonly projection: WalletProjectionService,
    private readonly assetLink: AssetLinkService
  ) {}

  async create(actor: AuthUser, workspaceId: string, dto: CreateExpenseDto): Promise<ExpenseDetailView> {
    const role = await assertWalletRole(actor, workspaceId);
    await assertWorkspaceWritable(this.directory, workspaceId);

    const input = { amount: dto.amount, splitType: dto.splitType, participants: dto.participants, paidBy: dto.paidBy };
    assertSplitConsistent(input, await getWalletLimits());
    await assertActiveMembers(this.directory, workspaceId, [dto.paidBy, ...dto.participants.map((p) => p.userId)]);
    await assertAssetReady(this.directory, dto.receiptAssetId, actor.id);

    await this.walletRepo.ensureSettings(workspaceId);
    await this.walletRepo.ensureBalances(workspaceId, [dto.paidBy, ...dto.participants.map((p) => p.userId)]);
    const workspaceName = await this.directory.workspaceName(workspaceId);
    const shares = splitExpense(input);

    const expenseId = await withTransaction(async (tx) => {
      const expense = await this.expenseRepo.create(
        {
          workspaceId,
          kind: "EXPENSE",
          adjustsExpenseId: null,
          amount: dto.amount,
          description: dto.description,
          normalizedDescription: normalizeDescription(dto.description),
          category: dto.category,
          paidBy: dto.paidBy,
          splitType: dto.splitType,
          participants: toParticipantRows(dto.participants),
          receiptAssetId: dto.receiptAssetId ?? null,
          occurredAt: dto.occurredAt,
          createdBy: actor.id,
        },
        tx
      );
      await this.expenseRepo.createShares(toShareRows(expense.id, workspaceId, shares, dto.occurredAt), tx);
      const result = await this.projection.apply(tx, workspaceId, deltasOfShares(shares));

      if (dto.receiptAssetId) {
        await this.assetLink.attach(tx, {
          assetIds: [dto.receiptAssetId],
          targetType: "EXPENSE_RECEIPT",
          targetId: expense.id,
          scopeType: "WORKSPACE",
          scopeId: workspaceId,
          actorId: actor.id,
        });
      }

      if (shares.length > 0) {
        await notify(tx, {
          type: "wallet.expense-added",
          actorId: actor.id,
          scope: { type: "WORKSPACE", id: workspaceId },
          workspaceId,
          source: { type: "wallet-expense", id: expense.id },
          refs: { workspaceId, expenseId: expense.id, workspaceName: workspaceName ?? undefined },
          recipients: shares.map((s) => ({ userId: s.debtorId })),
          dedupeKey: `wallet.expense-added:${expense.id}:v${expense.version}`,
        });
      }
      await emitWalletUpdated(tx, workspaceId, result, "EXPENSE");
      return expense.id;
    });

    return this.detail(actor, expenseId, isWalletAdmin(role));
  }

  async list(actor: AuthUser, workspaceId: string, query: ListExpensesQueryDto): Promise<CursorPage<ExpenseView>> {
    const role = await assertWalletRole(actor, workspaceId);
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    if (query.cursor && !cursor) throw new ValidationError("Cursor không hợp lệ");

    const rows = await this.expenseRepo.list(workspaceId, {
      userId: query.userId,
      category: query.category,
      from: query.from,
      to: query.to,
      cursor,
      limit: query.limit,
    });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;

    const mine = await this.expenseRepo.listSharesOfDebtorForExpenses(
      page.map((e) => e.id),
      actor.id
    );
    const myByExpense = new Map(mine.map((s) => [s.expenseId, s]));
    const isAdmin = isWalletAdmin(role);
    const last = page[page.length - 1];
    return {
      data: page.map((e) => toExpenseView(e, actor.id, isAdmin, myByExpense.get(e.id))),
      nextCursor: hasMore && last ? encodeCursor(last.occurredAt, last.id) : null,
      hasMore,
      limit: query.limit,
    };
  }

  async get(actor: AuthUser, expenseId: string): Promise<ExpenseDetailView> {
    const expense = await this.expenseRepo.findById(expenseId);
    if (!expense || expense.deletedAt) throw new ScopeNotFoundError();
    const role = await assertWalletRole(actor, expense.workspaceId);
    return this.detail(actor, expenseId, isWalletAdmin(role));
  }

  async detail(actor: AuthUser, expenseId: string, isAdmin: boolean): Promise<ExpenseDetailView> {
    const expense = await this.expenseRepo.findById(expenseId);
    if (!expense) throw new ScopeNotFoundError();
    const [shares, adjustments] = await Promise.all([
      this.expenseRepo.listShares(expenseId),
      this.expenseRepo.listAdjustments(expenseId),
    ]);
    return toExpenseDetailView(expense, shares, adjustments, actor.id, isAdmin);
  }
}
