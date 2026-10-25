import { runtimeConfig } from "../../../core/config/runtime-config";
import { LIMITS } from "../../../core/constants/limits";
import { createContextLogger } from "../../../infrastructure/logger";

const log = createContextLogger({ service: "MentorSettings" });
const { min, max, default: fallback } = LIMITS.mentor.durationDays;

/** Cài đặt runtime của Mentor Connect (`SystemConfig` khoá `mentor`, field `defaultDurationDays`) — service không import `runtimeConfig` trực tiếp mà nhận cổng này. */
export interface IMentorSettings {
  /** Số ngày mặc định của một đợt cố vấn khi người duyệt không chọn — luôn trong [`durationDays.min`, `durationDays.max`]. */
  defaultDurationDays(): Promise<number>;
}

export class RuntimeMentorSettings implements IMentorSettings {
  async defaultDurationDays(): Promise<number> {
    try {
      const value = await runtimeConfig.get("mentor.defaultDurationDays");
      // Registry đã clamp theo floor/ceil; kiểm lại phòng giá trị hỏng (không phải số nguyên) → mặc định của mã.
      if (typeof value === "number" && Number.isInteger(value) && value >= min && value <= max) return value;
    } catch (err) {
      log.warn("Không đọc được mentor.defaultDurationDays, dùng mặc định", { error: err instanceof Error ? err.message : String(err) });
    }
    return fallback;
  }
}
