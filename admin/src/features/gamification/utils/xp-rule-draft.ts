import type { XpRule, XpRuleDraft } from '../types/gamification.types';

/** Phần sửa được của một luật — nền để so "có thay đổi chưa" và dựng bản nháp. */
export const pickDraft = (r: XpRule): XpRuleDraft => ({
  xp: r.xp,
  dailyCap: r.dailyCap,
  countsForStreak: r.countsForStreak,
  isActive: r.isActive,
});

export const sameDraft = (a: XpRuleDraft, b: XpRuleDraft): boolean =>
  a.xp === b.xp &&
  a.dailyCap === b.dailyCap &&
  a.countsForStreak === b.countsForStreak &&
  a.isActive === b.isActive;

/** Một dòng tóm tắt cho hộp thoại xác nhận: "10 XP · trần không · tính chuỗi · bật". */
export const describeDraft = (d: XpRuleDraft): string =>
  `${d.xp} XP · trần ${d.dailyCap ?? 'không'} · ${d.countsForStreak ? 'tính chuỗi' : 'không tính chuỗi'} · ${d.isActive ? 'bật' : 'tắt'}`;
