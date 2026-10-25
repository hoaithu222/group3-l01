/**
 * Kiểu dữ liệu DANH MỤC kinh tế xu (admin p7-02) — vật phẩm cửa hàng, luật thưởng, nhiệm vụ ngày — viết tay theo BE thật `be/src/modules/coins`
 * (`services/coins-presenter.ts` → `AdminShopItemDto`/`AdminRuleDto`/`AdminQuestDto`; `dtos/admin-economy.dto.ts` → payload ghi). Tách khỏi `economy.types.ts`
 * (tổng quan + ví + sổ cái) để mỗi file trong giới hạn độ dài. Ngày là chuỗi ISO.
 */
import type { CoinQuestMetric, CoinSourceType, ShopItemKind } from './economy.types';

// ── Vật phẩm cửa hàng ────────────────────────────────────────────────────────

export interface AdminShopItem {
  id: string;
  code: string;
  name: string;
  kind: ShopItemKind;
  price: number;
  assetId: string | null;
  /** Token hiển thị theo loại (`SHOP_ITEM_DATA_SCHEMAS` BE). */
  data: Record<string, unknown> | null;
  availableFrom: string | null;
  availableTo: string | null;
  isActive: boolean;
  version: number;
  /** Số người đang sở hữu. */
  owners: number;
}

export interface CreateShopItemPayload {
  code: string;
  name: string;
  kind: ShopItemKind;
  price: number;
  data: Record<string, unknown>;
  isActive: boolean;
  availableFrom: string | null;
  availableTo: string | null;
  reason: string;
}

/** Sửa vật phẩm: KHÔNG đổi `code`/`kind`; chỉ gửi trường thay đổi. */
export interface UpdateShopItemPayload {
  id: string;
  expectedVersion: number;
  reason: string;
  name?: string;
  price?: number;
  data?: Record<string, unknown>;
  isActive?: boolean;
  availableFrom?: string | null;
  availableTo?: string | null;
}

// ── Luật thưởng xu ───────────────────────────────────────────────────────────

export interface AdminCoinRule {
  sourceType: CoinSourceType;
  coins: number;
  dailyCap: number | null;
  isActive: boolean;
  version: number;
  /** Xu đã phát theo luật này trong 7 ngày gần nhất. */
  issued7d: number;
}

/** Phần sửa được của một luật — nền để so "có thay đổi chưa". */
export interface CoinRuleDraft {
  coins: number;
  dailyCap: number | null;
  isActive: boolean;
}

/** `PATCH /admin/economy/rules/:sourceType` — tạo luật mới thì `expectedVersion` = 0. */
export interface PutCoinRulePayload extends CoinRuleDraft {
  sourceType: CoinSourceType;
  expectedVersion: number;
  reason: string;
}

// ── Nhiệm vụ ngày ────────────────────────────────────────────────────────────

export interface AdminCoinQuest {
  id: string;
  code: string;
  title: string;
  description: string;
  metric: CoinQuestMetric;
  target: number;
  coins: number;
  isActive: boolean;
  order: number;
  version: number;
}

export interface CreateQuestPayload {
  code: string;
  title: string;
  description: string;
  metric: CoinQuestMetric;
  target: number;
  coins: number;
  isActive: boolean;
  order: number;
  reason: string;
}

/** Sửa nhiệm vụ: không đổi `code`; chỉ gửi trường thay đổi. */
export interface UpdateQuestPayload {
  id: string;
  expectedVersion: number;
  reason: string;
  title?: string;
  description?: string;
  metric?: CoinQuestMetric;
  target?: number;
  coins?: number;
  isActive?: boolean;
  order?: number;
}
