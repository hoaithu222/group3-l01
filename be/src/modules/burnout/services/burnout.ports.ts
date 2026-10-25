import { runtimeConfig } from "../../../core/config/runtime-config";
import { BURNOUT_RULES_CONFIG_KEY } from "../../../core/constants/burnout";
import { MODULES } from "../../../core/constants/modules";
import { createContextLogger } from "../../../infrastructure/logger";
import { emitToUsers } from "../../../infrastructure/socket/socket.emit";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { AuditService } from "../../audit-log/audit-log.service";
import { notify } from "../../notifications/public";
import { createSystemConfigService, type SystemConfigActor } from "../../system-config/public";
import { DEFAULT_BURNOUT_RULE_SET, parseRuleSet, type BurnoutRuleSet, type BurnoutSuggestion, type WellbeingLevel } from "../domain/burnout-rules";
import type { TxHandle } from "../repositories/tx";
import { BURNOUT_NOTIFICATION_TYPES } from "./burnout-notification-types";

const log = createContextLogger({ service: "BurnoutPorts" });

/**
 * Cổng phụ trợ của `burnout` — service không import `runtimeConfig`/socket/`AuditService`/`notify`/`system-config` trực tiếp mà nhận qua DI (test truyền bản giả), cùng mẫu `coins.ports.ts`.
 */
export interface IBurnoutConfig {
  /** Phân hệ `burnout` đang bật (`FEATURE_FLAGS` ⊕ `SystemConfig` ⊕ `AVAILABLE_MODULES`) — tắt thì KHÔNG thu thập, KHÔNG chấm điểm, KHÔNG cảnh báo. */
  enabled(): Promise<boolean>;
}

export class RuntimeBurnoutConfig implements IBurnoutConfig {
  enabled(): Promise<boolean> {
    return runtimeConfig.isFeatureEnabled(MODULES.BURNOUT);
  }
}

/** Bộ luật ĐANG hiệu lực cho lần chấm điểm kế tiếp (không tính lại quá khứ). Lỗi đọc/lưu hỏng → bộ luật mặc định theo đặc tả (job không bao giờ hỏng vì cấu hình). */
export interface IBurnoutRuleSource {
  current(): Promise<BurnoutRuleSet>;
}

export class RuntimeBurnoutRuleSource implements IBurnoutRuleSource {
  async current(): Promise<BurnoutRuleSet> {
    try {
      const { ruleSet, usedDefault } = parseRuleSet(await runtimeConfig.getEffective(BURNOUT_RULES_CONFIG_KEY));
      if (usedDefault) log.warn("Bộ luật burnout đã lưu không hợp lệ — dùng bộ luật mặc định");
      return ruleSet;
    } catch (err) {
      log.warn("Không đọc được bộ luật burnout, dùng mặc định", { error: err instanceof Error ? err.message : String(err) });
      return DEFAULT_BURNOUT_RULE_SET;
    }
  }
}

export interface RulesSnapshot {
  ruleSet: BurnoutRuleSet;
  /** `version` bản ghi `SystemConfig` (CAS ở tầng lưu) — KHÁC `ruleSet.version` (phiên bản bộ luật hiển thị, tăng 1 mỗi lần lưu). */
  configVersion: number;
  updatedAt: Date | null;
  updatedBy: string | null;
  usedDefault: boolean;
}

/** Đọc/ghi bộ luật cho màn admin — ghi qua `SystemConfigService` (kiểm hình dạng, CAS, xoá cache đa instance, audit `system-config.update`). */
export interface IBurnoutRulesAdminPort {
  read(): Promise<RulesSnapshot>;
  write(value: BurnoutRuleSet, expectedConfigVersion: number, reason: string, actor: SystemConfigActor): Promise<void>;
}

export class SystemConfigRulesAdminPort implements IBurnoutRulesAdminPort {
  private readonly service = createSystemConfigService();

  async read(): Promise<RulesSnapshot> {
    const dto = await this.service.getOne(BURNOUT_RULES_CONFIG_KEY);
    const { ruleSet, usedDefault } = parseRuleSet(dto.effective);
    return { ruleSet, configVersion: dto.version, updatedAt: dto.updatedAt, updatedBy: dto.updatedBy, usedDefault };
  }

  async write(value: BurnoutRuleSet, expectedConfigVersion: number, reason: string, actor: SystemConfigActor): Promise<void> {
    await this.service.update(BURNOUT_RULES_CONFIG_KEY, { value: { ...value }, expectedVersion: expectedConfigVersion, reason }, actor);
  }
}

export interface AuditInput {
  actorId: string;
  actorRole?: string;
  action: string;
  targetType: string;
  targetId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

/** Audit CHỈ cho hành động của admin (sửa luật). Hành động của người dùng (bật/tắt/xoá dữ liệu) KHÔNG ghi audit — admin đọc được audit nên sẽ lộ ai đang dùng tính năng. */
export interface IBurnoutAudit {
  record(input: AuditInput): Promise<void>;
}

export class ServiceBurnoutAudit implements IBurnoutAudit {
  private readonly audit = new AuditService();

  record(input: AuditInput): Promise<void> {
    return this.audit.record(input);
  }
}

export interface WellbeingAlertPayload {
  assessmentId: string;
  level: Exclude<WellbeingLevel, "LOW">;
  suggestion: BurnoutSuggestion | null;
}

export interface IBurnoutEmitter {
  alert(userId: string, payload: WellbeingAlertPayload): void;
}

/**
 * `wellbeing:alert` → `user:{id}` (mọi thiết bị của CHÍNH người đó; p7-03 be.md §6). Không có điểm/phút/nhân tố. Lỗi phát KHÔNG làm hỏng nghiệp vụ — thông báo trong hộp thư + `GET /me/wellbeing` là nguồn sự thật,
 * app hiện toast khi mở lại (WELL-05).
 */
export class SocketBurnoutEmitter implements IBurnoutEmitter {
  alert(userId: string, payload: WellbeingAlertPayload): void {
    try {
      emitToUsers([userId], SocketEvent.WELLBEING_ALERT, payload);
    } catch {
      // Best-effort: worker riêng phát qua cầu nối Redis; lỗi chỉ bỏ qua.
    }
  }
}

/** Ghi thông báo hộp thư (kèm push trung tính, tôn trọng giờ yên lặng/DND của người dùng) TRONG transaction của assessor. */
export interface IBurnoutNotifier {
  alert(tx: TxHandle, input: { userId: string; assessmentId: string }): Promise<void>;
}

export class NotifyBurnoutNotifier implements IBurnoutNotifier {
  async alert(tx: TxHandle, input: { userId: string; assessmentId: string }): Promise<void> {
    await notify(tx, {
      type: BURNOUT_NOTIFICATION_TYPES.ALERT,
      scope: null,
      source: { type: "BurnoutAssessment", id: input.assessmentId },
      // CHỈ id tham chiếu — KHÔNG mức/điểm (bản ghi thông báo và push đều có thể bị đọc ngoài ngữ cảnh riêng tư của màn hình).
      refs: { assessmentId: input.assessmentId },
      recipients: [{ userId: input.userId }],
      dedupeKey: `wellbeing.alert:assessment:${input.assessmentId}`,
    });
  }
}
