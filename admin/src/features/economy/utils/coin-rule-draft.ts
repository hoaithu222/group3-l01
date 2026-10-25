import { formatNumber } from '@/shared/utils/format';

import { COIN_LIMITS, COIN_SOURCE_TYPES } from '../constants/economy.constants';
import type { AdminCoinRule, CoinRuleDraft } from '../types/economy-catalog.types';
import type { CoinSourceType } from '../types/economy.types';

/** Một dòng bảng luật: nguồn XP + luật đã có (`null` = chưa có luật — tạo với `expectedVersion` 0). */
export interface CoinRuleRow {
  sourceType: CoinSourceType;
  rule: AdminCoinRule | null;
}

/**
 * Mọi nguồn XP đều có dòng (BE chỉ trả luật ĐÃ tạo), theo thứ tự cố định; luật của nguồn lạ (BE thêm về sau, FE chưa biết) đứng cuối
 * để không mất khỏi màn hình.
 */
export function buildRuleRows(rules: readonly AdminCoinRule[]): CoinRuleRow[] {
  const bySource = new Map(rules.map((r) => [r.sourceType, r] as const));
  const known = COIN_SOURCE_TYPES.map((sourceType) => ({
    sourceType,
    rule: bySource.get(sourceType) ?? null,
  }));
  const unknown = rules
    .filter((r) => !COIN_SOURCE_TYPES.includes(r.sourceType))
    .map((rule) => ({ sourceType: rule.sourceType, rule }));
  return [...known, ...unknown];
}

/** Nền để dựng bản nháp và so "có thay đổi chưa". Nguồn chưa có luật: 0 xu (chưa hợp lệ — phải nhập ≥ 1), tắt. */
export const pickRuleDraft = (row: CoinRuleRow): CoinRuleDraft =>
  row.rule
    ? { coins: row.rule.coins, dailyCap: row.rule.dailyCap, isActive: row.rule.isActive }
    : { coins: 0, dailyCap: null, isActive: false };

export const sameRuleDraft = (a: CoinRuleDraft, b: CoinRuleDraft): boolean =>
  a.coins === b.coins && a.dailyCap === b.dailyCap && a.isActive === b.isActive;

const isIntIn = (v: number, min: number, max: number): boolean =>
  Number.isInteger(v) && v >= min && v <= max;

/** Khớp `putRuleSchema` BE (`coins` 1–1 000, `dailyCap` 1–trần chung hoặc `null`); `null` = hợp lệ. */
export function ruleDraftError(d: CoinRuleDraft): string | null {
  if (!isIntIn(d.coins, 1, COIN_LIMITS.ruleCoinsMax)) {
    return `Xu mỗi lần phải từ 1 đến ${formatNumber(COIN_LIMITS.ruleCoinsMax)}`;
  }
  if (d.dailyCap !== null && !isIntIn(d.dailyCap, 1, COIN_LIMITS.dailyEarnCap)) {
    return `Trần ngày phải từ 1 đến ${COIN_LIMITS.dailyEarnCap} (hoặc để trống)`;
  }
  return null;
}

/** Một dòng tóm tắt cho hộp thoại xác nhận: "10 xu · trần 50/ngày · bật". */
export const describeRuleDraft = (d: CoinRuleDraft): string =>
  `${formatNumber(d.coins)} xu · ${d.dailyCap === null ? 'theo trần chung' : `trần ${formatNumber(d.dailyCap)}/ngày`} · ${d.isActive ? 'bật' : 'tắt'}`;
