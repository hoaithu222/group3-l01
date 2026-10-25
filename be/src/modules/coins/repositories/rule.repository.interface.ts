import type { CoinRule, CoinRuleWrite, CoinSourceTypeValue } from "../entities/coins.interface";

export interface ICoinRuleRepository {
  listAll(): Promise<CoinRule[]>;
  find(sourceType: CoinSourceTypeValue): Promise<CoinRule | null>;
  /** `null` khi đã có luật cùng `sourceType` (unique) — caller báo xung đột phiên bản. */
  create(sourceType: CoinSourceTypeValue, data: CoinRuleWrite, actorId: string): Promise<CoinRule | null>;
  /** CAS theo `version`: `null` khi lệch (hoặc không có luật). */
  updateIf(sourceType: CoinSourceTypeValue, expectedVersion: number, data: CoinRuleWrite, actorId: string): Promise<CoinRule | null>;
}
