import {
  INTEGRATION_EVENT_TYPES,
  INTEGRATION_PROVIDER_KIND,
  INTEGRATION_PROVIDER_LABELS,
  INTEGRATION_PROVIDER_TO_KEY,
  INTEGRATION_PROVIDERS,
  type IntegrationProviderKey,
  type IntegrationProviderValue,
} from "../../../core/constants/integration";
import { intErrors } from "../integrations.errors";
import type { IntegrationProvider } from "../providers/provider.interface";
import type { ProviderRegistry } from "../providers/provider.registry";

export interface ProviderInfo {
  provider: IntegrationProviderValue;
  /** Đoạn URL (`/integrations/:provider/callback`, `.../:provider/connect`). */
  key: IntegrationProviderKey;
  label: string;
  kind: "WORKSPACE" | "USER";
  /** Đủ khoá env ở server (thiếu ⇒ nút kết nối ẩn, không lỗi). */
  configured: boolean;
  /** Admin nền tảng chưa tắt (`SystemConfig integrations.providers.<key>.enabled`, mặc định bật). */
  enabled: boolean;
  /** `configured && enabled && phân hệ bật` — app chỉ hiện nút Kết nối khi `true`. */
  available: boolean;
  events: readonly string[];
}

export interface AvailabilityDeps {
  registry: ProviderRegistry;
  /** `runtimeConfig.getEffective("integrations")` — `{ providers: { <key>: { enabled } } }`. */
  readConfig: () => Promise<Record<string, unknown>>;
  /** `runtimeConfig.isFeatureEnabled("integration")`. */
  moduleEnabled: () => Promise<boolean>;
}

function enabledIn(config: Record<string, unknown>, key: IntegrationProviderKey): boolean {
  const providers = config.providers as Record<string, { enabled?: unknown } | undefined> | undefined;
  return providers?.[key]?.enabled !== false;
}

/**
 * Một nơi trả lời "nhà cung cấp X dùng được không": module `integration` bật ∧ đủ khoá env ∧ admin chưa tắt (INT-09). Webhook của provider TẮT vẫn được
 * xác thực rồi ghi `IGNORED` (không từ chối); kết nối mới bị chặn `INT_001`.
 */
export class ProviderAvailability {
  constructor(private readonly deps: AvailabilityDeps) {}

  async isEnabled(provider: IntegrationProviderValue): Promise<boolean> {
    if (!(await this.deps.moduleEnabled())) return false;
    return enabledIn(await this.deps.readConfig(), INTEGRATION_PROVIDER_TO_KEY[provider]);
  }

  /** Adapter khi provider dùng được; ngược lại `INT_001`. */
  async requireUsable(provider: IntegrationProviderValue): Promise<IntegrationProvider> {
    const adapter = this.deps.registry.get(provider);
    if (!adapter || !adapter.isConfigured() || !(await this.isEnabled(provider))) throw intErrors.providerDisabled();
    return adapter;
  }

  async describe(): Promise<ProviderInfo[]> {
    const [moduleOn, config] = await Promise.all([this.deps.moduleEnabled(), this.deps.readConfig()]);
    return INTEGRATION_PROVIDERS.map((provider) => {
      const key = INTEGRATION_PROVIDER_TO_KEY[provider];
      const adapter = this.deps.registry.get(provider);
      const configured = adapter?.isConfigured() ?? false;
      const enabled = enabledIn(config, key);
      return {
        provider,
        key,
        label: INTEGRATION_PROVIDER_LABELS[provider],
        kind: INTEGRATION_PROVIDER_KIND[provider],
        configured,
        enabled,
        available: moduleOn && configured && enabled,
        events: INTEGRATION_EVENT_TYPES[provider],
      };
    });
  }
}
