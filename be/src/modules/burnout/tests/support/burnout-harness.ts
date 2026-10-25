/**
 * Bộ dựng dùng chung cho unit test của `burnout` (KHÔNG phải test): mọi repository/kho tín hiệu in-memory + cổng phụ trợ giả ghi lại lời gọi, service THẬT nối vào. Đồng hồ giả (`clockMs`) chỉnh được.
 * File test PHẢI tự khai `jest.mock` cho thứ nó import trực tiếp cần hạ tầng (logger/redis đã được `src/tests/setup.ts` mock toàn cục).
 */
import type { SystemConfigActor } from "../../../system-config/public";
import { DEFAULT_BURNOUT_RULE_SET } from "../../../../core/constants/burnout";
import { VersionConflictError } from "../../../../core/exceptions";
import type { BurnoutRuleSet } from "../../domain/burnout-rules";
import type { AuditInput, IBurnoutAudit, IBurnoutConfig, IBurnoutEmitter, IBurnoutNotifier, IBurnoutRuleSource, IBurnoutRulesAdminPort, RulesSnapshot, WellbeingAlertPayload } from "../../services/burnout.ports";
import { InMemoryBurnoutAggregateRepository } from "../../repositories/aggregate.repository.inmemory";
import { InMemoryBurnoutAssessmentRepository } from "../../repositories/assessment.repository.inmemory";
import { InMemoryWellbeingDailyRepository } from "../../repositories/daily.repository.inmemory";
import { InMemoryBurnoutDirectory } from "../../repositories/directory.inmemory";
import { InMemoryWellbeingSettingRepository } from "../../repositories/setting.repository.inmemory";
import { InMemoryWellbeingShareRepository } from "../../repositories/share.repository.inmemory";
import { InMemoryBurnoutSignalStore } from "../../repositories/signal-store.inmemory";
import { InMemoryOutboxPort, InMemoryTxRunner } from "../../repositories/tx";
import { BurnoutAdminService } from "../../services/burnout-admin.service";
import { BurnoutAggregatorService } from "../../services/burnout-aggregator.service";
import { BurnoutAssessorService } from "../../services/burnout-assessor.service";
import { BurnoutCollectorService } from "../../services/burnout-collector.service";
import { BurnoutEvaluationService } from "../../services/burnout-evaluation.service";
import { BurnoutHistoryService } from "../../services/burnout-history.service";
import { BurnoutPrivacyService } from "../../services/burnout-privacy.service";
import { BurnoutSettingService } from "../../services/burnout-setting.service";
import { WellbeingShareService } from "../../services/wellbeing-share.service";
import type { WorkspaceMembershipPort, WorkspaceMembershipStatus } from "../../../../shared/ports/workspace-membership.port";

export const VN = "Asia/Ho_Chi_Minh";
export const PARIS = "Europe/Paris";

/** Một người dùng mẫu (ObjectId 24 hex). */
export const userId = (n: number): string => n.toString(16).padStart(24, "0");

export class FakeConfig implements IBurnoutConfig {
  isEnabled = true;

  enabled(): Promise<boolean> {
    return Promise.resolve(this.isEnabled);
  }
}

export class FakeRuleSource implements IBurnoutRuleSource {
  rules: BurnoutRuleSet = DEFAULT_BURNOUT_RULE_SET;

  current(): Promise<BurnoutRuleSet> {
    return Promise.resolve(this.rules);
  }
}

export class FakeNotifier implements IBurnoutNotifier {
  readonly calls: Array<{ userId: string; assessmentId: string }> = [];

  alert(_tx: unknown, input: { userId: string; assessmentId: string }): Promise<void> {
    this.calls.push(input);
    return Promise.resolve();
  }
}

export class FakeEmitter implements IBurnoutEmitter {
  readonly events: Array<{ userId: string; payload: WellbeingAlertPayload }> = [];

  alert(userId: string, payload: WellbeingAlertPayload): void {
    this.events.push({ userId, payload });
  }
}

export class FakeAudit implements IBurnoutAudit {
  readonly records: AuditInput[] = [];

  record(input: AuditInput): Promise<void> {
    this.records.push(input);
    return Promise.resolve();
  }
}

/** Kho luật giả có CAS `configVersion` như `SystemConfig` thật (0 = chưa từng lưu → mặc định). */
export class FakeRulesAdminPort implements IBurnoutRulesAdminPort {
  stored: BurnoutRuleSet | null = null;
  configVersion = 0;
  updatedBy: string | null = null;
  updatedAt: Date | null = null;
  readonly writes: Array<{ value: BurnoutRuleSet; reason: string; actor: SystemConfigActor }> = [];

  read(): Promise<RulesSnapshot> {
    return Promise.resolve({ ruleSet: this.stored ?? DEFAULT_BURNOUT_RULE_SET, configVersion: this.configVersion, updatedAt: this.updatedAt, updatedBy: this.updatedBy, usedDefault: this.stored === null });
  }

  write(value: BurnoutRuleSet, expectedConfigVersion: number, reason: string, actor: SystemConfigActor): Promise<void> {
    if (expectedConfigVersion !== this.configVersion) return Promise.reject(new VersionConflictError(this.configVersion));
    this.stored = value;
    this.configVersion += 1;
    this.updatedBy = actor.id;
    this.updatedAt = new Date();
    this.writes.push({ value, reason, actor });
    return Promise.resolve();
  }
}

/** Cổng membership giả cho P1 (chia sẻ với trưởng nhóm) — CHỈ `statusOf` được `WellbeingShareService` gọi tới; các hàm còn lại (cấp/thu hồi khách) không thuộc phạm vi burnout nên ném lỗi nếu lỡ gọi nhầm. */
export class FakeMembershipPort implements WorkspaceMembershipPort {
  /** Khoá `${workspaceId}|${userId}`. */
  readonly statuses = new Map<string, WorkspaceMembershipStatus>();

  setStatus(workspaceId: string, userId: string, status: WorkspaceMembershipStatus | null): void {
    const key = `${workspaceId}|${userId}`;
    if (status === null) this.statuses.delete(key);
    else this.statuses.set(key, status);
  }

  statusOf(workspaceId: string, userId: string): Promise<WorkspaceMembershipStatus | null> {
    return Promise.resolve(this.statuses.get(`${workspaceId}|${userId}`) ?? null);
  }

  grantGuestInTx(): Promise<never> {
    return Promise.reject(new Error("FakeMembershipPort: grantGuestInTx không thuộc phạm vi test burnout"));
  }

  updateGuestExpiryInTx(): Promise<never> {
    return Promise.reject(new Error("FakeMembershipPort: updateGuestExpiryInTx không thuộc phạm vi test burnout"));
  }

  afterGuestChange(): Promise<void> {
    return Promise.resolve();
  }

  revokeGuest(): Promise<never> {
    return Promise.reject(new Error("FakeMembershipPort: revokeGuest không thuộc phạm vi test burnout"));
  }
}

/** 2026-03-10 22:20 UTC = 05:20 ngày 2026-03-11 giờ Việt Nam (đúng giờ tick `wellbeing.evaluate` của múi giờ VN). */
export const TICK_AT = Date.UTC(2026, 2, 10, 22, 20, 0);

export class BurnoutHarness {
  clockMs = TICK_AT;
  private readonly now = (): Date => new Date(this.clockMs);

  readonly settings = new InMemoryWellbeingSettingRepository(this.now);
  readonly dailies = new InMemoryWellbeingDailyRepository(this.now);
  readonly assessments = new InMemoryBurnoutAssessmentRepository(this.now);
  readonly aggregate = new InMemoryBurnoutAggregateRepository(this.settings, this.assessments);
  readonly directory = new InMemoryBurnoutDirectory();
  readonly shares = new InMemoryWellbeingShareRepository();
  readonly store = new InMemoryBurnoutSignalStore();
  readonly tx = new InMemoryTxRunner();
  readonly outbox = new InMemoryOutboxPort();
  readonly config = new FakeConfig();
  readonly ruleSource = new FakeRuleSource();
  readonly notifier = new FakeNotifier();
  readonly emitter = new FakeEmitter();
  readonly audit = new FakeAudit();
  readonly rulesAdmin = new FakeRulesAdminPort();
  readonly membership = new FakeMembershipPort();

  readonly collector = new BurnoutCollectorService({ store: this.store, directory: this.directory, config: this.config, now: this.now });
  readonly aggregator = new BurnoutAggregatorService({ store: this.store, dailies: this.dailies });
  readonly assessor = new BurnoutAssessorService({ settings: this.settings, dailies: this.dailies, assessments: this.assessments, notifier: this.notifier, emitter: this.emitter, tx: this.tx, now: this.now });
  readonly evaluation = new BurnoutEvaluationService({
    settings: this.settings,
    directory: this.directory,
    store: this.store,
    aggregator: this.aggregator,
    assessor: this.assessor,
    config: this.config,
    rules: this.ruleSource,
    now: this.now,
  });
  readonly privacy = new BurnoutPrivacyService({ settings: this.settings, dailies: this.dailies, assessments: this.assessments, shares: this.shares, store: this.store, tx: this.tx, now: this.now });
  readonly setting = new BurnoutSettingService({
    settings: this.settings,
    dailies: this.dailies,
    assessments: this.assessments,
    store: this.store,
    directory: this.directory,
    tx: this.tx,
    outbox: this.outbox,
    now: this.now,
  });
  readonly history = new BurnoutHistoryService({ settings: this.settings, dailies: this.dailies, assessments: this.assessments, directory: this.directory, tx: this.tx, now: this.now });
  readonly admin = new BurnoutAdminService({ aggregate: this.aggregate, rules: this.rulesAdmin, audit: this.audit, now: this.now });
  readonly share = new WellbeingShareService({
    shares: this.shares,
    settings: this.settings,
    assessments: this.assessments,
    directory: this.directory,
    membership: this.membership,
    now: this.now,
  });

  /** Người dùng ĐANG HOẠT ĐỘNG với múi giờ `tz` (chưa bật theo dõi). */
  addUser(id: string, tz: string = VN): string {
    this.directory.users.set(id, tz);
    return id;
  }

  /** Bật theo dõi qua đường thật (`BurnoutSettingService`) — đặt `optedInAt` = đồng hồ hiện tại. */
  async optIn(id: string, tz: string = VN): Promise<void> {
    this.addUser(id, tz);
    await this.setting.update(id, { optIn: true });
  }

  /** Ghi thẳng một hàng chỉ số ngày (bỏ qua Redis) để test bộ chấm điểm. */
  seedDaily(id: string, date: string, over: Partial<{ activeMinutes: number; longestContinuousMinutes: number; lateNightMinutes: number; eventsCount: number; lateNightEvents: number }> = {}) {
    return this.dailies.upsert({ userId: id, date, timezone: VN, activeMinutes: 0, longestContinuousMinutes: 0, lateNightMinutes: 0, eventsCount: 0, lateNightEvents: 0, ...over });
  }
}
