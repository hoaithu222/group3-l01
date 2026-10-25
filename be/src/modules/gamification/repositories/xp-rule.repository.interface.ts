import type { XpRule, XpSourceTypeValue } from "../entities/gamification.interface";

export interface XpRuleWrite {
  xp: number;
  dailyCap: number | null;
  countsForStreak: boolean;
  isActive: boolean;
}

export interface IXpRuleRepository {
  listAll(): Promise<XpRule[]>;
  find(sourceType: XpSourceTypeValue): Promise<XpRule | null>;
  /** CAS `version` (+1) — `null` = lệch phiên bản hoặc luật không tồn tại (caller đọc lại để chọn 404/409). */
  updateIf(sourceType: XpSourceTypeValue, expectedVersion: number, patch: XpRuleWrite, actorId: string): Promise<XpRule | null>;
  /** Seed: chỉ TẠO luật còn thiếu (không ghi đè bản admin đã sửa). Trả số luật tạo mới. */
  createMissing(rows: ReadonlyArray<XpRuleWrite & { sourceType: XpSourceTypeValue }>): Promise<number>;
}
