import { withTransaction } from "../../../infrastructure/database";
import { VersionConflictError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";
import type { AuthUser } from "../../../core/types/express";
import type { AuditService } from "../../audit-log/audit-log.service";
import type { WalletSettingsView } from "../entities/wallet.interface";
import type { WalletSettingsDto } from "../dtos";
import type { IWalletDirectory } from "../repositories/wallet-directory.interface";
import type { IWalletRepository } from "../repositories/wallet.repository.interface";
import { assertWalletRole, assertWorkspaceWritable, isWalletAdmin } from "./wallet-access";
import { walletError } from "./expense-helpers";
import { toSettingsView } from "./wallet-presenter";
import type { WalletReminderService } from "./wallet-reminder.service";
import { emitWalletUpdated } from "./wallet-support";

type AuditRecorder = Pick<AuditService, "record">;

/** Cài đặt ví (lịch nhắc, nơi đăng) + "Nhắc ngay" — OWNER/ADMIN. */
export class WalletSettingsService {
  constructor(
    private readonly walletRepo: IWalletRepository,
    private readonly directory: IWalletDirectory,
    private readonly reminder: WalletReminderService,
    private readonly audit: AuditRecorder
  ) {}

  async get(actor: AuthUser, workspaceId: string): Promise<WalletSettingsView> {
    const role = await assertWalletRole(actor, workspaceId);
    const settings = await this.walletRepo.ensureSettings(workspaceId);
    return toSettingsView(settings, isWalletAdmin(role));
  }

  async update(actor: AuthUser, workspaceId: string, dto: WalletSettingsDto): Promise<WalletSettingsView> {
    await assertWalletRole(actor, workspaceId, "ADMIN");
    await assertWorkspaceWritable(this.directory, workspaceId);

    const targetType = dto.reminderTargetType;
    const targetId = targetType === "NONE" ? null : (dto.reminderTargetId ?? null);
    if (targetType !== "NONE" && (!targetId || !(await this.directory.isValidReminderTarget(workspaceId, targetType, targetId)))) {
      throw walletError(ErrorCode.WALLET_008, 400);
    }

    const current = await this.walletRepo.ensureSettings(workspaceId);
    const updated = await withTransaction(async (tx) => {
      const next = await this.walletRepo.updateSettings(
        workspaceId,
        dto.expectedVersion,
        {
          reminderEnabled: dto.reminderEnabled,
          reminderCron: dto.reminderCron,
          timezone: dto.timezone,
          reminderTargetType: targetType,
          reminderTargetId: targetId,
          reminderMinDebt: dto.reminderMinDebt,
        },
        tx
      );
      if (!next) throw new VersionConflictError(current.version);
      await emitWalletUpdated(tx, workspaceId, { walletVersion: next.walletVersion, changedUserIds: [] }, "SETTINGS");
      return next;
    });

    // Không ghi tên/ID nơi nhận nhắc lẫn nội dung — chỉ dấu vết ai đổi cấu hình nào.
    await this.audit.record({
      actorId: actor.id,
      action: "wallet.settings-update",
      targetType: "Workspace",
      targetId: workspaceId,
      workspaceId,
      metadata: { reminderEnabled: updated.reminderEnabled, reminderTargetType: updated.reminderTargetType },
    });
    return toSettingsView(updated, true);
  }

  async remindNow(actor: AuthUser, workspaceId: string): Promise<{ remindedCount: number }> {
    await assertWalletRole(actor, workspaceId, "ADMIN");
    await this.walletRepo.ensureSettings(workspaceId);
    return { remindedCount: await this.reminder.remind(workspaceId, { manual: true }) };
  }
}
