import { runtimeConfig } from "./runtime-config";
import { DEFAULT_GUEST_CONFIG, type GuestConfig } from "../constants/guest-policy";

export interface IGuestConfig {
  load(): Promise<GuestConfig>;
}

const num = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** Đọc qua `runtimeConfig` (bộ nhớ → Redis → Mongo, fail-open về mặc định) — trần `SystemConfig limits.guest`. */
export class RuntimeGuestConfig implements IGuestConfig {
  async load(): Promise<GuestConfig> {
    try {
      const eff = await runtimeConfig.getEffective("limits.guest");
      return {
        ...DEFAULT_GUEST_CONFIG,
        enabledByDefault: typeof eff.enabledByDefault === "boolean" ? eff.enabledByDefault : DEFAULT_GUEST_CONFIG.enabledByDefault,
        defaultDays: num(eff.defaultDays, DEFAULT_GUEST_CONFIG.defaultDays),
        maxDays: num(eff.maxDays, DEFAULT_GUEST_CONFIG.maxDays),
        maxPerWorkspace: num(eff.maxPerWorkspace, DEFAULT_GUEST_CONFIG.maxPerWorkspace),
      };
    } catch {
      return DEFAULT_GUEST_CONFIG;
    }
  }
}

/** Cấu hình tĩnh — unit test / nơi không cần override runtime. */
export class StaticGuestConfig implements IGuestConfig {
  constructor(private readonly config: GuestConfig = DEFAULT_GUEST_CONFIG) {}
  async load(): Promise<GuestConfig> {
    return this.config;
  }
}
