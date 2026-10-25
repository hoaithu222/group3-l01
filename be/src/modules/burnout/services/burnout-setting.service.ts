import { LIMITS } from "../../../core/constants/limits";
import { DEFAULT_TIME_ZONE, addDaysToLocalDate } from "../../../core/utils/local-date";
import { createContextLogger } from "../../../infrastructure/logger";
import { burnoutErrors } from "../burnout.errors";
import { dayConfigFrom, wellbeingDateOf, type DayConfig } from "../domain/wellbeing-day";
import { isTrackingEnabled, type PreferredBreak, type SettingPatch } from "../entities/burnout.interface";
import type { IBurnoutAssessmentRepository } from "../repositories/assessment.repository.interface";
import type { IWellbeingDailyRepository } from "../repositories/daily.repository.interface";
import type { IBurnoutDirectory } from "../repositories/directory";
import type { IWellbeingSettingRepository } from "../repositories/setting.repository.interface";
import type { IBurnoutSignalStore } from "../repositories/signal-store";
import type { IOutboxPort, ITxRunner } from "../repositories/tx";
import { purgeOutboxRow } from "./burnout-events";
import { presentSetting, type SettingDto } from "./burnout-presenter";

const log = createContextLogger({ service: "BurnoutSetting" });

export interface UpdateSettingInput {
  optIn: boolean;
  alertsEnabled?: boolean;
  /** `null` = xoá giờ nghỉ mong muốn. */
  preferredBreak?: PreferredBreak | null;
}

/** `PATCH /me/wellbeing` — không có `optIn` (xem `patchSettingSchema`). */
export interface PatchSettingInput {
  alertsEnabled?: boolean;
  preferredBreak?: PreferredBreak | null;
}

export interface BurnoutSettingDeps {
  settings: IWellbeingSettingRepository;
  dailies: IWellbeingDailyRepository;
  assessments: IBurnoutAssessmentRepository;
  store: IBurnoutSignalStore;
  directory: IBurnoutDirectory;
  tx: ITxRunner;
  outbox: IOutboxPort;
  dayConfig?: DayConfig;
  now?: () => Date;
}

/**
 * Bật/tắt/xoá dữ liệu của CHÍNH người dùng (p7-03 be.md §4/§5). Mặc định TẮT: xem cài đặt KHÔNG tạo dòng nào. Mọi hàm nhận `userId` từ token (không từ path/body) nên không có đường nào tác động tới người khác.
 * Hành động cá nhân KHÔNG ghi audit (audit đọc được bởi admin sẽ lộ ai đang dùng tính năng) và log kỹ thuật không kèm định danh.
 */
export class BurnoutSettingService {
  private readonly cfg: DayConfig;
  private readonly now: () => Date;

  constructor(private readonly d: BurnoutSettingDeps) {
    this.cfg = d.dayConfig ?? dayConfigFrom(LIMITS.wellbeing);
    this.now = d.now ?? (() => new Date());
  }

  async get(userId: string): Promise<SettingDto> {
    const setting = await this.d.settings.findByUserId(userId);
    if (setting === null || !isTrackingEnabled(setting)) return presentSetting(setting, []);
    // Đánh giá vài ngày gần nhất đủ để tìm "mới nhất" + cảnh báo chưa được bấm.
    const timezone = (await this.d.directory.getActiveUser(userId))?.timezone ?? DEFAULT_TIME_ZONE;
    const since = addDaysToLocalDate(wellbeingDateOf(this.now(), timezone, this.cfg), -LIMITS.wellbeing.recentAlertDays);
    return presentSetting(setting, await this.d.assessments.listSince(userId, since));
  }

  /** `optIn: true` — bật (hoặc chỉ sửa cài đặt nếu đã bật); `optIn: false` — tắt VÀ xoá dữ liệu ngay (idempotent). */
  async update(userId: string, input: UpdateSettingInput): Promise<SettingDto> {
    if (input.optIn) await this.enable(userId, input);
    else await this.disable(userId);
    return this.get(userId);
  }

  /**
   * Sửa cài đặt phụ CHỈ KHI ĐANG BẬT (`PATCH`). Khác `update`: KHÔNG bao giờ bật theo dõi — người đã tắt (kể cả vừa tắt ở máy khác)
   * nhận `WELL_001` và không có dòng nào bị ghi. Kiểm-rồi-ghi không nguyên tử, nhưng `settings.patch` chỉ đổi trường cài đặt chứ không
   * đụng `optedInAt`/trạng thái bật, nên đua với một lệnh tắt cùng lúc cũng không thể làm sống lại theo dõi.
   */
  async patch(userId: string, input: PatchSettingInput): Promise<SettingDto> {
    const current = await this.d.settings.findByUserId(userId);
    if (current === null || !isTrackingEnabled(current)) throw burnoutErrors.notEnabled();
    await this.d.settings.patch(userId, {
      ...(input.alertsEnabled !== undefined && { alertsEnabled: input.alertsEnabled }),
      ...(input.preferredBreak !== undefined && { preferredBreak: input.preferredBreak }),
    });
    return this.get(userId);
  }

  /** Xoá toàn bộ dữ liệu đã thu thập nhưng GIỮ trạng thái bật (thu thập tiếp từ giờ). An toàn khi gọi lặp hoặc khi chưa bật (dọn phần còn sót). */
  async deleteMyData(userId: string): Promise<void> {
    await this.d.tx.run(async (tx) => {
      await this.d.dailies.deleteByUser(userId, tx);
      await this.d.assessments.deleteByUser(userId, tx);
    });
    await this.d.settings.resetAlertState(userId);
    await this.d.store.deleteUserBuckets(userId).catch((err: unknown) => log.warn("Chưa xoá được bucket Redis khi xoá dữ liệu", { error: err instanceof Error ? err.message : String(err) }));
  }

  private async enable(userId: string, input: UpdateSettingInput): Promise<void> {
    const patch: SettingPatch = {
      ...(input.alertsEnabled !== undefined && { alertsEnabled: input.alertsEnabled }),
      ...(input.preferredBreak !== undefined && { preferredBreak: input.preferredBreak }),
    };
    const current = await this.d.settings.findByUserId(userId);
    if (current !== null && isTrackingEnabled(current)) await this.d.settings.patch(userId, patch);
    else await this.d.settings.enable(userId, this.now(), patch);
    // Mongo là nguồn sự thật; SADD idempotent (cũng "chữa" trường hợp tập Redis mất dữ liệu). Redis lỗi KHÔNG làm hỏng việc bật: job hằng giờ đồng bộ lại tập này từ Mongo.
    try {
      await this.d.store.addOptIn(userId);
    } catch (err) {
      log.warn("Chưa thêm được vào tập thu thập trên Redis — job wellbeing.evaluate sẽ đồng bộ lại", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  private async disable(userId: string): Promise<void> {
    const current = await this.d.settings.findByUserId(userId);
    if (current === null || !isTrackingEnabled(current)) return;
    const optedOutAt = this.now();
    // Một transaction: tắt + xoá chỉ số/đánh giá + dòng outbox dọn dẹp bền (Redis không nằm trong transaction).
    await this.d.tx.run(async (tx) => {
      await this.d.settings.disable(userId, optedOutAt, tx);
      await this.d.dailies.deleteByUser(userId, tx);
      await this.d.assessments.deleteByUser(userId, tx);
      await this.d.outbox.add(tx, purgeOutboxRow(userId, optedOutAt));
    });
    // Ngừng thu thập NGAY (không đợi job): gỡ khỏi tập "đã bật" rồi xoá bucket. Job `wellbeing.purge` lặp lại phần này nếu bước này hỏng.
    try {
      await this.d.store.removeOptIn(userId);
      await this.d.store.deleteUserBuckets(userId);
    } catch (err) {
      log.warn("Dọn Redis khi tắt theo dõi chưa xong — job wellbeing.purge sẽ làm tiếp", { error: err instanceof Error ? err.message : String(err) });
    }
  }
}
