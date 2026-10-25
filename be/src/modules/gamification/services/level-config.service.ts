import { LIMITS } from "../../../core/constants/limits";
import { AppError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { SystemConfigActor } from "../../system-config/public";
import { DEFAULT_LEVEL_CONFIG, maxThreshold, thresholds, type LevelConfig } from "./level";
import type { IGamConfigPort } from "./gamification.ports";

export const LEVEL_CONFIG_KEY = "gamification.level";
export const MIN_TASK_AGE_KEY = "gamification.minTaskAgeSec";
/** `UserGamification.xp` là Int32 (Mongo) — ngưỡng cấp cao nhất không được vượt. */
const XP_INT_MAX = 2_000_000_000;

const num = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

export interface LevelConfigView extends LevelConfig {
  version: number;
  thresholdsPreview: number[];
}

/**
 * Cấu hình cấp độ + tuổi tối thiểu của thẻ (SystemConfig `gamification.level`, `gamification.minTaskAgeSec` — p4-03 README §7). Đọc đường nóng qua
 * `runtimeConfig` (cache), ghi qua `SystemConfigService` (floor/ceil, CAS, audit). Đổi cấu hình KHÔNG hạ cấp người đã đạt (`level = max(level, …)`).
 */
export class LevelConfigService {
  constructor(private readonly config: IGamConfigPort) {}

  async get(): Promise<LevelConfig> {
    const e = await this.config.effective(LEVEL_CONFIG_KEY);
    return { base: num(e.base, DEFAULT_LEVEL_CONFIG.base), maxLevel: num(e.maxLevel, DEFAULT_LEVEL_CONFIG.maxLevel) };
  }

  async minTaskAgeSec(): Promise<number> {
    const e = await this.config.effective(MIN_TASK_AGE_KEY);
    return num(e.value, LIMITS.gamification.minTaskAgeSec);
  }

  async view(): Promise<LevelConfigView> {
    const { effective, version } = await this.config.getOne(LEVEL_CONFIG_KEY);
    const cfg: LevelConfig = { base: num(effective.base, DEFAULT_LEVEL_CONFIG.base), maxLevel: num(effective.maxLevel, DEFAULT_LEVEL_CONFIG.maxLevel) };
    return { ...cfg, version, thresholdsPreview: thresholds(cfg).slice(0, LIMITS.gamification.levelPreviewCount) };
  }

  /** `GAME_005` khi cấu hình làm ngưỡng cấp cao nhất vượt Int32 (XP không lưu nổi). */
  async update(dto: LevelConfig & { expectedVersion: number; reason: string }, actor: SystemConfigActor): Promise<LevelConfigView> {
    if (maxThreshold({ base: dto.base, maxLevel: dto.maxLevel }) > XP_INT_MAX) {
      throw new AppError(ErrorMessages[ErrorCode.GAME_005], 400, ErrorCode.GAME_005, { base: dto.base, maxLevel: dto.maxLevel });
    }
    await this.config.update(LEVEL_CONFIG_KEY, { base: dto.base, maxLevel: dto.maxLevel }, dto.expectedVersion, dto.reason, actor);
    return this.view();
  }
}
