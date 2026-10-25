import { LIMITS } from "../../../core/constants/limits";
import { DEFAULT_TIME_ZONE, addDaysToLocalDate } from "../../../core/utils/local-date";
import { burnoutErrors } from "../burnout.errors";
import { snoozeUntil } from "../domain/alert-policy";
import { dayConfigFrom, wellbeingDateOf, type DayConfig } from "../domain/wellbeing-day";
import { isTrackingEnabled, type AckAction } from "../entities/burnout.interface";
import type { IBurnoutAssessmentRepository } from "../repositories/assessment.repository.interface";
import type { IWellbeingDailyRepository } from "../repositories/daily.repository.interface";
import type { IBurnoutDirectory } from "../repositories/directory";
import type { IWellbeingSettingRepository } from "../repositories/setting.repository.interface";
import type { ITxRunner } from "../repositories/tx";
import { presentAssessment, presentDaily, type AssessmentDto, type DailyDto } from "./burnout-presenter";

export interface HistoryDto {
  days: number;
  dailies: DailyDto[];
  assessments: AssessmentDto[];
}

/** Lịch sử 7/30 ngày và ack cảnh báo của CHÍNH người dùng — mọi truy vấn đều theo `userId` từ token. */
export class BurnoutHistoryService {
  private readonly cfg: DayConfig;
  private readonly now: () => Date;

  constructor(
    private readonly d: {
      settings: IWellbeingSettingRepository;
      dailies: IWellbeingDailyRepository;
      assessments: IBurnoutAssessmentRepository;
      directory: IBurnoutDirectory;
      tx: ITxRunner;
      dayConfig?: DayConfig;
      now?: () => Date;
    }
  ) {
    this.cfg = d.dayConfig ?? dayConfigFrom(LIMITS.wellbeing);
    this.now = d.now ?? (() => new Date());
  }

  /** `WELL_001` khi chưa bật theo dõi (app điều hướng sang màn giải thích/bật). */
  async history(userId: string, days: number): Promise<HistoryDto> {
    const setting = await this.d.settings.findByUserId(userId);
    if (setting === null || !isTrackingEnabled(setting)) throw burnoutErrors.notEnabled();
    const timezone = (await this.d.directory.getActiveUser(userId))?.timezone ?? DEFAULT_TIME_ZONE;
    const since = addDaysToLocalDate(wellbeingDateOf(this.now(), timezone, this.cfg), -days);
    const [dailies, assessments] = await Promise.all([this.d.dailies.listSince(userId, since), this.d.assessments.listSince(userId, since)]);
    return { days, dailies: dailies.map(presentDaily), assessments: assessments.map(presentAssessment) };
  }

  /**
   * "Đã hiểu" (`DISMISS`) / "Nhắc lại sau" (`SNOOZE` — tạm hoãn cảnh báo `alertCooldownHours` giờ kể từ lúc bấm). 404 khi id không thuộc người gọi HOẶC đánh giá chưa từng cảnh báo (không phân biệt). Bấm lại là no-op:
   * hành động ĐẦU TIÊN được giữ.
   */
  async acknowledge(userId: string, assessmentId: string, action: AckAction): Promise<void> {
    const assessment = await this.d.assessments.findOwned(assessmentId, userId);
    if (!assessment || !assessment.alerted) throw burnoutErrors.notFound("Không tìm thấy cảnh báo");
    const now = this.now();
    await this.d.tx.run(async (tx) => {
      const first = await this.d.assessments.acknowledge(assessmentId, userId, action, now, tx);
      if (first && action === "SNOOZE") await this.d.settings.setSnooze(userId, snoozeUntil(now, LIMITS.wellbeing.alertCooldownHours), tx);
    });
  }
}
