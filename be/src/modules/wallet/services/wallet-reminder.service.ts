import { withTransaction } from "../../../infrastructure/database";
import { createContextLogger } from "../../../infrastructure/logger";
import { notify } from "../../notifications/public";
import { minCashFlow } from "../domain/wallet-math";
import type { IWalletDirectory } from "../repositories/wallet-directory.interface";
import type { IWalletRepository } from "../repositories/wallet.repository.interface";
import "./wallet-notifications";
import { localDayKey } from "./wallet-support";

const log = createContextLogger({ service: "WalletReminderService" });

/** Cổng tối thiểu của `SystemMessageService.post()` (p1-04) — tránh import chéo kiểu nội bộ của `messages`. */
export interface WalletSystemMessagePort {
  post(input: {
    scopeType: "CONVERSATION" | "CHANNEL";
    scopeId: string;
    workspaceId: string;
    systemType: "WALLET_REMINDER";
    payload: { workspaceId: string; debtorsCount: number };
    dedupeKey: string;
  }): Promise<unknown>;
}

export interface RemindOptions {
  now?: Date;
  /** "Nhắc ngay" của ADMIN — bỏ qua công tắc nhắc định kỳ. */
  manual?: boolean;
}

/**
 * Nhắc nợ (README §2 "Nhắc nợ"): thông báo RIÊNG có số tiền tới từng người nợ (engine p0-06 tự áp DND/lịch
 * yên lặng cho push) + tuỳ chọn 1 tin hệ thống vào nhóm chat/kênh KHÔNG bao giờ nêu số tiền hay tên người nợ.
 * Idempotent theo NGÀY địa phương của ví (dedupeKey theo yyyymmdd) — chạy lặp không thông báo trùng.
 */
export class WalletReminderService {
  constructor(
    private readonly walletRepo: IWalletRepository,
    private readonly directory: IWalletDirectory,
    private readonly systemMessages: WalletSystemMessagePort
  ) {}

  /** Trả số người nợ được nhắc. */
  async remind(workspaceId: string, opts: RemindOptions = {}): Promise<number> {
    const now = opts.now ?? new Date();
    const settings = await this.walletRepo.getSettings(workspaceId);
    if (!settings || !settings.enabled) return 0;
    if (!opts.manual && !settings.reminderEnabled) return 0;

    const balances = await this.walletRepo.getBalances(workspaceId, null);
    const debtorsRaw = balances.filter((b) => b.balance < 0 && b.balance <= -settings.reminderMinDebt);
    const roles = await this.directory.activeRoles(workspaceId, debtorsRaw.map((b) => b.userId));
    const debtors = debtorsRaw.filter((b) => {
      const role = roles.get(b.userId);
      return role !== undefined && role !== "GUEST";
    });
    if (debtors.length === 0) {
      await this.walletRepo.markReminded(workspaceId, now, opts.manual === true);
      return 0;
    }

    const suggestions = minCashFlow(new Map(balances.filter((b) => b.balance !== 0).map((b) => [b.userId, b.balance])));
    const workspaceName = await this.directory.workspaceName(workspaceId);
    const dayKey = localDayKey(now, settings.timezone);

    // "Nhắc ngay" cho phép gửi lại trong ngày (limiter 1 lần/giờ) nên khoá thêm mốc giờ; định kỳ chỉ 1 lần/ngày.
    const dedupeSuffix = opts.manual ? `-m${Math.floor(now.getTime() / 3_600_000)}` : "";
    const fresh: typeof debtors = [];
    for (const debtor of debtors) {
      const key = `wallet.debt-reminder:${workspaceId}:${dayKey}${dedupeSuffix}:${debtor.userId}`;
      if (!(await this.directory.notificationExists(key))) fresh.push(debtor);
    }

    await withTransaction(async (tx) => {
      for (const debtor of fresh) {
        await notify(tx, {
          type: "wallet.debt-reminder",
          scope: { type: "WORKSPACE", id: workspaceId },
          workspaceId,
          source: { type: "wallet-remind", id: `${workspaceId}-${dayKey}${dedupeSuffix}` },
          refs: {
            workspaceId,
            workspaceName: workspaceName ?? undefined,
            amount: -debtor.balance,
            suggestionsTo: suggestions.filter((s) => s.fromId === debtor.userId).map((s) => s.toId),
          },
          recipients: [{ userId: debtor.userId }],
          dedupeKey: `wallet.debt-reminder:${workspaceId}:${dayKey}${dedupeSuffix}:${debtor.userId}`,
        });
      }
    });

    await this.postGroupReminder(workspaceId, settings, debtors.length, dayKey);
    await this.walletRepo.markReminded(workspaceId, now, opts.manual === true);
    return debtors.length;
  }

  /** Lỗi ở đây (nhóm chat/kênh đã đổi, mất quyền đăng) chỉ ghi log — không được làm hỏng thông báo riêng đã gửi. */
  private async postGroupReminder(
    workspaceId: string,
    settings: { reminderTargetType: string; reminderTargetId: string | null },
    debtorsCount: number,
    dayKey: string
  ): Promise<void> {
    const type = settings.reminderTargetType;
    if ((type !== "CONVERSATION" && type !== "CHANNEL") || !settings.reminderTargetId) return;
    try {
      if (!(await this.directory.isValidReminderTarget(workspaceId, type, settings.reminderTargetId))) return;
      await this.systemMessages.post({
        scopeType: type,
        scopeId: settings.reminderTargetId,
        workspaceId,
        systemType: "WALLET_REMINDER",
        payload: { workspaceId, debtorsCount },
        dedupeKey: `wallet-remind-msg:${workspaceId}:${dayKey}`,
      });
    } catch (err) {
      log.warn("Không đăng được nhắc nợ vào nhóm chat/kênh", { workspaceId, error: err instanceof Error ? err.message : String(err) });
    }
  }
}
