import { Prisma } from "@prisma/client";
import type { WorkspaceWallet } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { WalletBalanceRow, WalletSettings } from "../entities/wallet.interface";
import type { BalanceDelta, IWalletRepository, SettingsPatch, Tx } from "./wallet.repository.interface";
import { staticWalletDefaults, type WalletDefaultsReader } from "../wallet-defaults";

function toSettings(row: WorkspaceWallet): WalletSettings {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    currency: row.currency,
    enabled: row.enabled,
    reminderEnabled: row.reminderEnabled,
    reminderCron: row.reminderCron,
    timezone: row.timezone,
    reminderTargetType: row.reminderTargetType,
    reminderTargetId: row.reminderTargetId,
    reminderMinDebt: row.reminderMinDebt,
    lastRemindedAt: row.lastRemindedAt,
    lastManualRemindAt: row.lastManualRemindAt,
    walletVersion: row.walletVersion,
    version: row.version,
  };
}

export class PrismaWalletRepository implements IWalletRepository {
  /** `defaults` = lịch nhắc/múi giờ MẶC ĐỊNH của ví mới (container truyền bản đọc `SystemConfig wallet`; mặc định: hằng của mã). */
  constructor(private readonly defaults: WalletDefaultsReader = staticWalletDefaults) {}

  async getSettings(workspaceId: string, tx?: Tx): Promise<WalletSettings | null> {
    const row = await (tx ?? prisma).workspaceWallet.findUnique({ where: { workspaceId } });
    return row ? toSettings(row) : null;
  }

  async ensureSettings(workspaceId: string, tx?: Tx): Promise<WalletSettings> {
    const db = tx ?? prisma;
    const existing = await db.workspaceWallet.findUnique({ where: { workspaceId } });
    if (existing) return toSettings(existing);
    const defaults = await this.defaults();
    try {
      // Ghi tường minh null cho field sau này lọc/đọc (Prisma+Mongo không khớp field absent).
      const created = await db.workspaceWallet.create({
        data: {
          workspaceId,
          reminderCron: defaults.reminderCron,
          timezone: defaults.timezone,
          reminderMinDebt: defaults.reminderMinDebt,
          reminderTargetId: null,
          lastRemindedAt: null,
          lastManualRemindAt: null,
        },
      });
      return toSettings(created);
    } catch (err) {
      // Chỉ an toàn khi KHÔNG trong transaction (transaction đã abort sau lỗi ghi) — caller luôn gọi ensure trước tx.
      if (!tx && err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const raced = await prisma.workspaceWallet.findUniqueOrThrow({ where: { workspaceId } });
        return toSettings(raced);
      }
      throw err;
    }
  }

  async updateSettings(workspaceId: string, expectedVersion: number, patch: SettingsPatch, tx?: Tx): Promise<WalletSettings | null> {
    const db = tx ?? prisma;
    const result = await db.workspaceWallet.updateMany({
      where: { workspaceId, version: expectedVersion },
      data: { ...patch, version: { increment: 1 }, walletVersion: { increment: 1 } },
    });
    if (result.count === 0) return null;
    const row = await db.workspaceWallet.findUniqueOrThrow({ where: { workspaceId } });
    return toSettings(row);
  }

  async bumpWalletVersion(workspaceId: string, tx: Tx): Promise<number> {
    const row = await tx.workspaceWallet.update({
      where: { workspaceId },
      data: { walletVersion: { increment: 1 } },
      select: { walletVersion: true },
    });
    return row.walletVersion;
  }

  async markReminded(workspaceId: string, at: Date, manual: boolean): Promise<void> {
    await prisma.workspaceWallet.updateMany({
      where: { workspaceId },
      data: manual ? { lastRemindedAt: at, lastManualRemindAt: at } : { lastRemindedAt: at },
    });
  }

  async listReminderSchedules() {
    const rows = await prisma.workspaceWallet.findMany({
      select: { workspaceId: true, reminderCron: true, timezone: true, reminderEnabled: true, enabled: true, lastRemindedAt: true },
    });
    return rows;
  }

  async ensureBalances(workspaceId: string, userIds: string[]): Promise<void> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return;
    const existing = new Set(
      (await prisma.walletBalance.findMany({ where: { workspaceId, userId: { in: ids } }, select: { userId: true } })).map((r) => r.userId)
    );
    for (const userId of ids.filter((id) => !existing.has(id))) {
      try {
        await prisma.walletBalance.create({ data: { workspaceId, userId, balance: 0, owedTotal: 0 } });
      } catch (err) {
        // Đã có người khác tạo cùng lúc (unique index) — đúng ý định, bỏ qua. Ngoài transaction nên an toàn.
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      }
    }
  }

  async incBalances(workspaceId: string, deltas: BalanceDelta[], tx: Tx): Promise<void> {
    // Sắp theo userId để các transaction đồng thời chạm cùng tập user theo cùng thứ tự (giảm xung đột ghi).
    for (const d of [...deltas].sort((a, b) => (a.userId < b.userId ? -1 : 1))) {
      await tx.walletBalance.upsert({
        where: { workspaceId_userId: { workspaceId, userId: d.userId } },
        create: { workspaceId, userId: d.userId, balance: d.balance, owedTotal: d.owedTotal },
        update: { balance: { increment: d.balance }, owedTotal: { increment: d.owedTotal } },
      });
    }
  }

  async getBalances(workspaceId: string, userIds: string[] | null, tx?: Tx): Promise<WalletBalanceRow[]> {
    const rows = await (tx ?? prisma).walletBalance.findMany({
      where: { workspaceId, ...(userIds ? { userId: { in: userIds } } : {}) },
      select: { userId: true, balance: true, owedTotal: true },
    });
    return rows;
  }

  async overwriteBalances(workspaceId: string, rows: WalletBalanceRow[]): Promise<void> {
    for (const r of rows) {
      await prisma.walletBalance.upsert({
        where: { workspaceId_userId: { workspaceId, userId: r.userId } },
        create: { workspaceId, userId: r.userId, balance: r.balance, owedTotal: r.owedTotal },
        update: { balance: r.balance, owedTotal: r.owedTotal },
      });
    }
  }
}
