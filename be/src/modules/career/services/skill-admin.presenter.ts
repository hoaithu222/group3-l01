import { toDisplayCriteria, type DisplaySkillCriteria } from "../../../shared/criteria/skill-criteria";
import type { SkillCategory, SkillDefinition } from "../entities/skill.interface";

/** DTO admin của một kỹ năng (admin.md §2.1–2.2) — tiêu chí ở đơn vị hiển thị, kèm `version` cho CAS và số người đang giữ huy hiệu. */
export interface AdminSkillDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: SkillCategory;
  labelMatch: string[];
  criteria: DisplaySkillCriteria;
  icon: string;
  isActive: boolean;
  order: number;
  version: number;
  holdersCount: number;
  createdAt: string;
  updatedAt: string;
}

export function presentAdminSkill(s: SkillDefinition, holdersCount: number): AdminSkillDto {
  return {
    id: s.id,
    code: s.code,
    name: s.name,
    description: s.description,
    category: s.category,
    labelMatch: [...s.labelMatch],
    criteria: toDisplayCriteria(s.criteria),
    icon: s.icon,
    isActive: s.isActive,
    order: s.order,
    version: s.version,
    holdersCount,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

/** Rút gọn id cho admin (6 ký tự cuối) — admin KHÔNG đọc tiêu đề/nội dung task của nhóm. */
export const shortRef = (id: string): string => `#${id.slice(-6)}`;
