import { FeatureDisabledError, ValidationError } from "../../../core/exceptions";
import { LIMITS } from "../../../core/constants/limits";
import type { AuthUser } from "../../../core/types/express";
import type { CareerVisibility } from "../../career/public";
import type { CareerSettingsDto } from "../dtos";
import { talentRebuildRow } from "./recruiter-outbox-rows";
import type { RecruiterDeps } from "./recruiter.deps";

export interface CareerSettingsView {
  openToWork: boolean;
  openToWorkChangedAt: string | null;
  headline: string | null;
  preferredRoles: string[];
  location: string | null;
  /** Phiên bản chính sách dữ liệu sinh viên ĐÃ đồng ý (null khi chưa bao giờ bật). */
  consentVersion: string | null;
  visibility: CareerVisibility;
  /** Phiên bản chính sách HIỆN HÀNH — app hiện màn đồng ý khi khác `consentVersion`. */
  requiredConsentVersion: string;
  recruiterEnabled: boolean;
}

/**
 * `PUT /me/career` (be.md §5): bật/tắt Open to work + tiêu đề/vị trí/khu vực. Bật cần đồng ý ĐÚNG phiên bản chính sách hiện hành (`consentVersion`); tắt không cần.
 * TẮT → xoá bản chiếu tìm kiếm ĐỒNG BỘ trong cùng transaction với `UserCareer` (không đợi job), sau commit tăng `talent:search:ver` → biến mất khỏi mọi kết quả ngay (CR-06).
 * Mọi thay đổi khi đang/vừa bật xếp thêm MỘT job dựng lại đầy đủ qua outbox (bật lần đầu chạy ngay; còn lại debounce). Không đụng `visibility` (`PUT /me/career/visibility` của p6-06).
 */
export class CareerSettingsService {
  constructor(private readonly d: RecruiterDeps) {}

  async get(userId: string): Promise<CareerSettingsView> {
    return this.view(userId);
  }

  async update(user: AuthUser, dto: CareerSettingsDto): Promise<CareerSettingsView> {
    const required = await this.d.config.consentVersion();
    if (dto.openToWork) {
      if (!(await this.d.config.enabled())) throw new FeatureDisabledError();
      if (dto.consentVersion !== required) {
        throw new ValidationError("Chính sách dữ liệu đã được cập nhật, vui lòng đọc và đồng ý lại", { requiredConsentVersion: required });
      }
    }
    const now = this.d.now();
    await this.d.careerSettings.ensure(user.id);
    await this.d.tx.run(async (tx) => {
      const before = await this.d.careerSettings.before(user.id, tx);
      const wasOpen = before?.openToWork ?? false;
      await this.d.careerSettings.apply(
        user.id,
        { openToWork: dto.openToWork, headline: dto.headline || null, preferredRoles: dto.preferredRoles, location: dto.location || null, ...(dto.openToWork ? { consentVersion: dto.consentVersion } : {}) },
        now,
        wasOpen !== dto.openToWork,
        tx
      );
      // Đường tắt CR-06: tắt Open to work → xoá bản chiếu NGAY trong cùng transaction (không phụ thuộc job).
      if (!dto.openToWork) await this.d.index.delete(user.id, tx);
      if (dto.openToWork || wasOpen) await this.d.outbox.add(tx, talentRebuildRow(user.id, now, !wasOpen && dto.openToWork ? 0 : LIMITS.talent.indexDebounceSeconds));
    });
    await this.d.searchCache.bump();
    return this.view(user.id);
  }

  private async view(userId: string): Promise<CareerSettingsView> {
    const [c, required, enabled] = await Promise.all([this.d.careerReader.career(userId), this.d.config.consentVersion(), this.d.config.enabled()]);
    return {
      openToWork: c.openToWork,
      openToWorkChangedAt: c.openToWorkChangedAt ? c.openToWorkChangedAt.toISOString() : null,
      headline: c.headline,
      preferredRoles: [...c.preferredRoles],
      location: c.location,
      consentVersion: c.consentVersion,
      visibility: { ...c.visibility },
      requiredConsentVersion: required,
      recruiterEnabled: enabled,
    };
  }
}
