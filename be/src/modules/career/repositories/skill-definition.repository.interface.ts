import type { StoredSkillCriteria } from "../../../shared/criteria/skill-criteria";
import type { SkillCategory, SkillDefinition } from "../entities/skill.interface";
import type { TxHandle } from "./tx";

export interface CreateSkillInput {
  code: string;
  name: string;
  description: string | null;
  category: SkillCategory;
  labelMatch: string[];
  criteria: StoredSkillCriteria;
  icon: string;
  order: number;
  isActive: boolean;
  createdBy: string | null;
}

export type SkillPatch = Partial<Pick<SkillDefinition, "name" | "description" | "category" | "labelMatch" | "criteria" | "icon" | "order" | "isActive">> & {
  updatedBy: string | null;
};

export interface SkillListQuery {
  page: number;
  limit: number;
  q?: string;
  category?: SkillCategory;
  active?: boolean;
}

export interface ISkillDefinitionRepository {
  findById(id: string): Promise<SkillDefinition | null>;
  findByIds(ids: readonly string[]): Promise<SkillDefinition[]>;
  findByCode(code: string): Promise<SkillDefinition | null>;
  /** Mọi kỹ năng (bật lẫn tắt) có `labelMatch` giao với `labels` (đã chuẩn hoá) — credit được ghi cả khi kỹ năng tắt để admin xem trước (CR-27). */
  findByLabels(labels: readonly string[]): Promise<SkillDefinition[]>;
  /** Theo `order` rồi `name`. */
  listActive(): Promise<SkillDefinition[]>;
  listAll(): Promise<SkillDefinition[]>;
  listPage(query: SkillListQuery): Promise<{ rows: SkillDefinition[]; total: number }>;
  count(): Promise<number>;
  /** `code` trùng → `UniqueViolationError`. */
  create(input: CreateSkillInput): Promise<SkillDefinition>;
  /** CAS theo `version` (tăng 1); lệch → `null`. */
  updateCas(id: string, expectedVersion: number, patch: SkillPatch, tx?: TxHandle): Promise<SkillDefinition | null>;
}
