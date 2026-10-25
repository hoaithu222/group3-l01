import { LIMITS } from "../../../core/constants/limits";
import { isTrackingEnabled } from "../entities/burnout.interface";
import type { IBurnoutAssessmentRepository } from "../repositories/assessment.repository.interface";
import type { IWellbeingDailyRepository } from "../repositories/daily.repository.interface";
import type { IWellbeingSettingRepository } from "../repositories/setting.repository.interface";
import type { IWellbeingShareRepository } from "../repositories/share.repository.interface";
import type { IBurnoutSignalStore } from "../repositories/signal-store";
import type { ITxRunner } from "../repositories/tx";

export interface PurgeResult {
  dailies: number;
  assessments: number;
  buckets: number;
  setting: number;
  /** P1 — số dòng `WellbeingShare` đã xoá (be.md README §2 "Lưu giữ": tắt opt-in ⇒ xoá luôn chia sẻ). */
  shares: number;
}

/**
 * Xoá dữ liệu sức khoẻ học tập của MỘT người (p7-03 README §2 "Lưu giữ"/"Quyền được xoá"): mọi `WellbeingDaily` + `BurnoutAssessment` +
 * `WellbeingShare` (P1), tập "đã bật" và bucket Redis; `removeSetting` xoá luôn dòng cài đặt (ẩn danh hoá tài khoản, D-02). IDEMPOTENT —
 * chạy lại không còn gì để xoá, nên dùng được làm job bền (`wellbeing.purge`, `wellbeing.user-anonymized`) với retry. Lỗi Redis ném ra để
 * job thử lại (dữ liệu Mongo đã xoá trước).
 *
 * Cũng chứa job dọn theo hạn lưu giữ (`retentionDays`, cron 03:00).
 */
export class BurnoutPrivacyService {
  constructor(
    private readonly d: {
      settings: IWellbeingSettingRepository;
      dailies: IWellbeingDailyRepository;
      assessments: IBurnoutAssessmentRepository;
      shares: IWellbeingShareRepository;
      store: IBurnoutSignalStore;
      tx: ITxRunner;
      now?: () => Date;
    }
  ) {}

  async purgeUser(userId: string, opts: { removeSetting: boolean }): Promise<PurgeResult> {
    // Dừng thu thập TRƯỚC (một lệnh Redis) rồi mới xoá dữ liệu đã có — bucket không được ghi thêm trong lúc dọn.
    await this.d.store.removeOptIn(userId);
    const counts = await this.d.tx.run(async (tx) => ({
      dailies: await this.d.dailies.deleteByUser(userId, tx),
      assessments: await this.d.assessments.deleteByUser(userId, tx),
      shares: await this.d.shares.deleteByUser(userId, tx),
    }));
    const buckets = await this.d.store.deleteUserBuckets(userId);
    const setting = opts.removeSetting ? await this.d.settings.deleteByUser(userId) : 0;
    return { ...counts, buckets, setting };
  }

  /**
   * Job `wellbeing.purge` sau khi TẮT: nếu người dùng đã BẬT LẠI trước khi job chạy (dữ liệu hiện có là của lần bật mới) thì KHÔNG xoá — job chỉ dọn phần của lần tắt trước, mà phần đó đã được xoá cùng lúc tắt.
   * `null` = bỏ qua vì đã bật lại.
   */
  async purgeIfStillOptedOut(userId: string): Promise<PurgeResult | null> {
    const setting = await this.d.settings.findByUserId(userId);
    if (setting !== null && isTrackingEnabled(setting)) return null;
    return this.purgeUser(userId, { removeSetting: false });
  }

  /** Xoá chỉ số/đánh giá quá hạn lưu giữ (`createdAt` cũ hơn `retentionDays`). */
  async sweepRetention(): Promise<{ dailies: number; assessments: number }> {
    const now = this.d.now?.() ?? new Date();
    const cutoff = new Date(now.getTime() - LIMITS.wellbeing.retentionDays * 86_400_000);
    const [dailies, assessments] = await Promise.all([this.d.dailies.deleteCreatedBefore(cutoff), this.d.assessments.deleteCreatedBefore(cutoff)]);
    return { dailies, assessments };
  }
}
