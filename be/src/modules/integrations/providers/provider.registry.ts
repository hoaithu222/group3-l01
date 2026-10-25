import type { IntegrationProviderValue } from "../../../core/constants/integration";
import type { IntegrationProvider } from "./provider.interface";

/** Tập adapter nhà cung cấp đang có — dựng ở container (thật) hoặc test (giả). */
export class ProviderRegistry {
  private readonly byProvider = new Map<IntegrationProviderValue, IntegrationProvider>();

  constructor(providers: IntegrationProvider[]) {
    for (const p of providers) this.byProvider.set(p.provider, p);
  }

  get(provider: IntegrationProviderValue): IntegrationProvider | undefined {
    return this.byProvider.get(provider);
  }

  list(): IntegrationProvider[] {
    return [...this.byProvider.values()];
  }
}
