import { runtimeConfig } from "../../../core/config/runtime-config";
import { LIMITS } from "../../../core/constants/limits";
import { createContextLogger } from "../../../infrastructure/logger";

const log = createContextLogger({ service: "StudyLimits" });

/** Trần bộ học HIỆU LỰC lúc chạy = `LIMITS.study` ⊕ override `SystemConfig` `limits.study` (admin chỉ hạ được; registry đã clamp theo trần cứng). */
export interface StudyRuntimeLimits {
  itemsPerSetMax: number;
  setsPerUserMax: number;
  optionsMax: number;
}

export type StudyLimitsReader = () => Promise<StudyRuntimeLimits>;

const HARD: StudyRuntimeLimits = {
  itemsPerSetMax: LIMITS.study.itemsPerSetMax,
  setsPerUserMax: LIMITS.study.setsPerUserMax,
  optionsMax: LIMITS.study.optionsMax,
};

const pick = (value: unknown, fallback: number): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

/** Đọc qua `runtimeConfig` (cache bộ nhớ + Redis); lỗi đọc cấu hình → trần cứng (fail-open về mặc định, không làm hỏng nghiệp vụ). */
export const readStudyLimits: StudyLimitsReader = async () => {
  try {
    const eff = await runtimeConfig.getEffective("limits.study");
    return {
      itemsPerSetMax: pick(eff.itemsPerSetMax, HARD.itemsPerSetMax),
      setsPerUserMax: pick(eff.setsPerUserMax, HARD.setsPerUserMax),
      optionsMax: pick(eff.optionsMax, HARD.optionsMax),
    };
  } catch (err) {
    log.warn("Không đọc được limits.study, dùng mặc định", { error: err instanceof Error ? err.message : String(err) });
    return HARD;
  }
};

/** Bản đọc của `deps` (test truyền bản cố định) hoặc bản thật. */
export const studyLimitsOf = (deps: { limits?: StudyLimitsReader }): Promise<StudyRuntimeLimits> => (deps.limits ?? readStudyLimits)();
