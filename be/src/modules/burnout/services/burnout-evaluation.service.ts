import { LIMITS } from "../../../core/constants/limits";
import { addDaysToLocalDate, localHour } from "../../../core/utils/local-date";
import { createContextLogger } from "../../../infrastructure/logger";
import { dayConfigFrom, wellbeingDateOf, type DayConfig } from "../domain/wellbeing-day";
import type { IBurnoutDirectory } from "../repositories/directory";
import type { IWellbeingSettingRepository } from "../repositories/setting.repository.interface";
import type { IBurnoutSignalStore } from "../repositories/signal-store";
import type { BurnoutAggregatorService } from "./burnout-aggregator.service";
import type { BurnoutAssessorService } from "./burnout-assessor.service";
import type { IBurnoutConfig, IBurnoutRuleSource } from "./burnout.ports";

const log = createContextLogger({ service: "BurnoutEvaluation" });

export interface EvaluationReport {
  /** Người đang bật đã quét. */
  scanned: number;
  /** Người tới giờ (05:xx theo múi giờ của họ) và đã được tổng hợp + chấm. */
  evaluated: number;
  /** Số cảnh báo đã gửi. */
  alerts: number;
  failed: number;
}

/**
 * Tick hằng giờ `wellbeing.evaluate` (p7-03 be.md §7, mẫu `streak.check`): quét người ĐANG BẬT theo trang, nhóm theo múi giờ CỦA TỪNG NGƯỜI, và với người có giờ địa phương = giờ hết khung khuya (05:xx) thì tổng hợp
 * ngày wellbeing vừa kết thúc rồi chấm ngay. Idempotent — job chạy lại/chạy trùng không tạo thêm gì (upsert theo `(userId, date)`, cảnh báo chiếm nguyên tử). Tổng hợp kèm ngày liền trước để bắt kịp khi lỡ một nhịp.
 * Cuối lượt đồng bộ tập "đã bật" trên Redis từ Mongo (Redis mất dữ liệu ⇒ thu thập ngừng tới lượt này; chỉ THÊM người còn bật, chỉ GỠ người đã xác nhận không còn bật).
 */
export class BurnoutEvaluationService {
  private readonly cfg: DayConfig;
  private readonly now: () => Date;

  constructor(
    private readonly d: {
      settings: IWellbeingSettingRepository;
      directory: IBurnoutDirectory;
      store: IBurnoutSignalStore;
      aggregator: BurnoutAggregatorService;
      assessor: BurnoutAssessorService;
      config: IBurnoutConfig;
      rules: IBurnoutRuleSource;
      dayConfig?: DayConfig;
      now?: () => Date;
    }
  ) {
    this.cfg = d.dayConfig ?? dayConfigFrom(LIMITS.wellbeing);
    this.now = d.now ?? (() => new Date());
  }

  async run(): Promise<EvaluationReport> {
    const report: EvaluationReport = { scanned: 0, evaluated: 0, alerts: 0, failed: 0 };
    // Phân hệ tắt ⇒ không tổng hợp, không chấm, không cảnh báo (dữ liệu đã có vẫn nằm yên tới hạn lưu giữ hoặc khi người dùng xoá).
    if (!(await this.d.config.enabled())) return report;

    const now = this.now();
    const rules = await this.d.rules.current();
    const evaluateHour = Math.floor(this.cfg.lateNightEndMinute / 60);
    const enabledIds = new Set<string>();

    let after: string | null = null;
    for (;;) {
      const page = await this.d.settings.listEnabledPage(after, LIMITS.wellbeing.scanBatch);
      if (page.length === 0) break;
      after = page.at(-1)?.id ?? null;
      const timezones = await this.d.directory.activeTimezones(page.map((s) => s.userId));

      for (const setting of page) {
        enabledIds.add(setting.userId);
        report.scanned += 1;
        const timezone = timezones.get(setting.userId);
        if (!timezone || setting.optedInAt === null || localHour(now, timezone) !== evaluateHour) continue;
        try {
          const asOfDate = addDaysToLocalDate(wellbeingDateOf(now, timezone, this.cfg), -1);
          for (const date of [addDaysToLocalDate(asOfDate, -1), asOfDate]) {
            await this.d.aggregator.aggregate({ userId: setting.userId, date, timezone, optedInAt: setting.optedInAt });
          }
          const outcome = await this.d.assessor.assess(setting.userId, asOfDate, rules);
          report.evaluated += 1;
          if (outcome.kind === "SCORED" && outcome.alerted) report.alerts += 1;
        } catch (err) {
          report.failed += 1;
          log.warn("Đánh giá một người dùng lỗi", { error: err instanceof Error ? err.message : String(err) });
        }
      }
      if (page.length < LIMITS.wellbeing.scanBatch) break;
    }

    await this.syncOptInSet(enabledIds);
    return report;
  }

  private async syncOptInSet(enabledIds: ReadonlySet<string>): Promise<void> {
    try {
      for (const id of enabledIds) await this.d.store.addOptIn(id);
      for (const member of await this.d.store.optInMembers()) {
        // Người vừa bật SAU lúc quét sẽ không nằm trong `enabledIds` — chỉ gỡ khi Mongo xác nhận đã tắt.
        if (!enabledIds.has(member) && !(await this.stillEnabled(member))) await this.d.store.removeOptIn(member);
      }
    } catch (err) {
      log.warn("Không đồng bộ được tập người đã bật trên Redis", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  private async stillEnabled(userId: string): Promise<boolean> {
    const setting = await this.d.settings.findByUserId(userId);
    return setting !== null && setting.optedInAt !== null && setting.optedOutAt === null;
  }
}
