import { runtimeConfig } from "../../../core/config/runtime-config";
import { createContextLogger } from "../../../infrastructure/logger";

const log = createContextLogger({ service: "MarketplacePorts" });

export interface MarketplaceSettings {
  /** `SystemConfig economy.marketplaceEnabled` — README §7/be.md §9: mặc định TẮT (chờ điều khoản bản quyền được duyệt). */
  enabled: boolean;
  /** % phí nền tảng (làm tròn XUỐNG khi tính, `coin-math`-style tại service). */
  feePercent: number;
  /** Cấp độ gamification tối thiểu để niêm yết được duyệt NGAY (chưa đạt hoặc chưa từng có tin được duyệt → `PENDING_REVIEW`). */
  sellerMinLevel: number;
}

export interface IMarketplaceConfig {
  settings(): Promise<MarketplaceSettings>;
}

const HARD_DEFAULT: MarketplaceSettings = { enabled: false, feePercent: 10, sellerMinLevel: 5 };

/**
 * Đọc `SystemConfig` khoá `economy` (đăng ký ở `core/config/system-config.registry.ts`) — LỖI ĐỌC HOẶC KHOÁ CHƯA CẤU HÌNH → mặc định `enabled: false` (an toàn: thà chợ tắt oan còn hơn
 * bật oan khi chưa có điều khoản bản quyền được duyệt).
 */
export class RuntimeMarketplaceConfig implements IMarketplaceConfig {
  async settings(): Promise<MarketplaceSettings> {
    try {
      const eff = await runtimeConfig.getEffective("economy");
      return {
        enabled: typeof eff.marketplaceEnabled === "boolean" ? eff.marketplaceEnabled : HARD_DEFAULT.enabled,
        feePercent: typeof eff.marketplaceFeePercent === "number" ? eff.marketplaceFeePercent : HARD_DEFAULT.feePercent,
        sellerMinLevel: typeof eff.sellerMinLevel === "number" ? eff.sellerMinLevel : HARD_DEFAULT.sellerMinLevel,
      };
    } catch (err) {
      log.warn("Không đọc được SystemConfig economy, dùng mặc định (chợ tắt)", { error: err instanceof Error ? err.message : String(err) });
      return HARD_DEFAULT;
    }
  }
}
