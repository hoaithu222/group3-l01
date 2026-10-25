import { normalizeSearch } from "../../../src/core/utils/normalize";
import { projectShares, splitExpense } from "../../../src/modules/wallet/domain/wallet-math";
import { DAY_MS, Directory, prisma } from "./core";
import type { WorkspaceCtx } from "./workspace";

export interface SeededExpense {
  id: string;
  description: string;
  paidByKey: string;
  occurredAt: Date;
  debtorIds: string[];
}

/**
 * Quỹ nhóm: tạo ví (nếu chưa có), các khoản chi chia đều, phần nợ (`ExpenseShare`), số dư ròng (`WalletBalance`) và phép chiếu
 * trạng thái share theo FIFO — cùng công thức `ExpensesService.create` + `WalletProjectionService.apply`. Idempotent theo
 * (nhóm, mô tả chuẩn hoá, người trả, số tiền).
 */
export async function seedWallet(dir: Directory, ctx: WorkspaceCtx, now: Date): Promise<SeededExpense[]> {
  const specs = ctx.spec.expenses ?? [];
  if (specs.length === 0) return [];

  const wallet = await prisma.workspaceWallet.findUnique({ where: { workspaceId: ctx.id } });
  if (!wallet) {
    await prisma.workspaceWallet.create({
      data: {
        workspaceId: ctx.id,
        reminderCron: "0 9 * * 5",
        timezone: "Asia/Ho_Chi_Minh",
        reminderMinDebt: 10000,
        reminderTargetId: null,
        lastRemindedAt: null,
        lastManualRemindAt: null,
      },
    });
  }

  const created: SeededExpense[] = [];
  const affected = new Set<string>();
  for (const spec of specs) {
    const paidBy = dir.id(spec.paidBy);
    const normalizedDescription = normalizeSearch(spec.description);
    const dup = await prisma.workspaceExpense.findFirst({ where: { workspaceId: ctx.id, normalizedDescription, paidBy, amount: spec.amount }, select: { id: true } });
    if (dup) continue;
    for (const key of [spec.paidBy, ...spec.among]) {
      if (!ctx.roles.has(key)) throw new Error(`[${ctx.spec.key}] khoản chi "${spec.description}": "${key}" không phải thành viên nhóm`);
    }

    const occurredAt = new Date(now.getTime() - spec.daysAgo * DAY_MS);
    const participants = [...new Set(spec.among)].map((k) => ({ userId: dir.id(k) }));
    const shares = splitExpense({ amount: spec.amount, splitType: "EQUAL", participants, paidBy });
    const expense = await prisma.workspaceExpense.create({
      data: {
        workspaceId: ctx.id,
        kind: "EXPENSE",
        adjustsExpenseId: null,
        amount: spec.amount,
        description: spec.description,
        normalizedDescription,
        category: spec.category,
        paidBy,
        splitType: "EQUAL",
        participants: participants.map((p) => ({ userId: p.userId, amount: null, bps: null })),
        receiptAssetId: null,
        occurredAt,
        createdBy: paidBy,
        // Explicit null: danh sách lọc `deletedAt: null`.
        deletedAt: null,
        deletedBy: null,
        createdAt: occurredAt,
      },
    });
    if (shares.length > 0) {
      await prisma.expenseShare.createMany({
        data: shares.map((s) => ({ expenseId: expense.id, workspaceId: ctx.id, debtorId: s.debtorId, creditorId: s.creditorId, amount: s.amount, occurredAt })),
      });
    }

    const deltas = new Map<string, { balance: number; owedTotal: number }>();
    const bump = (userId: string, balance: number, owedTotal: number) => {
      const cur = deltas.get(userId) ?? { balance: 0, owedTotal: 0 };
      deltas.set(userId, { balance: cur.balance + balance, owedTotal: cur.owedTotal + owedTotal });
    };
    for (const s of shares) {
      bump(s.creditorId, s.amount, 0);
      bump(s.debtorId, -s.amount, s.amount);
    }
    for (const [userId, d] of deltas) {
      await prisma.walletBalance.upsert({
        where: { workspaceId_userId: { workspaceId: ctx.id, userId } },
        create: { workspaceId: ctx.id, userId, balance: d.balance, owedTotal: d.owedTotal },
        update: { balance: { increment: d.balance }, owedTotal: { increment: d.owedTotal } },
      });
      affected.add(userId);
    }
    created.push({ id: expense.id, description: spec.description, paidByKey: spec.paidBy, occurredAt, debtorIds: shares.map((s) => s.debtorId) });
  }

  if (created.length === 0) return [];

  // Phép chiếu FIFO: số dư ròng là nguồn sự thật, trạng thái từng share chỉ để hiển thị nhất quán với nó.
  for (const userId of affected) {
    const balance = await prisma.walletBalance.findUnique({ where: { workspaceId_userId: { workspaceId: ctx.id, userId } } });
    const own = await prisma.expenseShare.findMany({
      where: { workspaceId: ctx.id, debtorId: userId, status: { not: "VOID" } },
      select: { id: true, amount: true, occurredAt: true, paidAmount: true, status: true },
    });
    if (own.length === 0) continue;
    const projected = projectShares(own.map((s) => ({ id: s.id, amount: s.amount, occurredAt: s.occurredAt })), Math.max(0, -(balance?.balance ?? 0)));
    for (const p of projected) {
      const prev = own.find((s) => s.id === p.id);
      if (prev && (prev.paidAmount !== p.paidAmount || prev.status !== p.status)) {
        await prisma.expenseShare.update({ where: { id: p.id }, data: { paidAmount: p.paidAmount, status: p.status } });
      }
    }
  }
  await prisma.workspaceWallet.update({ where: { workspaceId: ctx.id }, data: { walletVersion: { increment: created.length } } });
  return created;
}
