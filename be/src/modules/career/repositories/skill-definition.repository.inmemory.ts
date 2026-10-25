/* eslint-disable @typescript-eslint/require-await -- bản in-memory cài đặt interface bất đồng bộ */
import { normalizeSearch } from "../../../core/utils/normalize";
import { newObjectId } from "../../../core/utils/object-id";
import type { SkillDefinition } from "../entities/skill.interface";
import type { CreateSkillInput, ISkillDefinitionRepository, SkillListQuery, SkillPatch } from "./skill-definition.repository.interface";
import { UniqueViolationError } from "./tx";

const byOrder = (a: SkillDefinition, b: SkillDefinition) => a.order - b.order || a.name.localeCompare(b.name);
const clone = (s: SkillDefinition): SkillDefinition => ({ ...s, labelMatch: [...s.labelMatch], criteria: { ...s.criteria } });

/** Bản in-memory cho unit test service (cùng hành vi CAS/unique như bản Prisma). */
export class InMemorySkillDefinitionRepository implements ISkillDefinitionRepository {
  readonly rows = new Map<string, SkillDefinition>();

  async findById(id: string): Promise<SkillDefinition | null> {
    const s = this.rows.get(id);
    return s ? clone(s) : null;
  }

  async findByIds(ids: readonly string[]): Promise<SkillDefinition[]> {
    return [...this.rows.values()].filter((s) => ids.includes(s.id)).sort(byOrder).map(clone);
  }

  async findByCode(code: string): Promise<SkillDefinition | null> {
    const s = [...this.rows.values()].find((r) => r.code === code);
    return s ? clone(s) : null;
  }

  async findByLabels(labels: readonly string[]): Promise<SkillDefinition[]> {
    return [...this.rows.values()].filter((s) => s.labelMatch.some((l) => labels.includes(l))).sort(byOrder).map(clone);
  }

  async listActive(): Promise<SkillDefinition[]> {
    return [...this.rows.values()].filter((s) => s.isActive).sort(byOrder).map(clone);
  }

  async listAll(): Promise<SkillDefinition[]> {
    return [...this.rows.values()].sort(byOrder).map(clone);
  }

  async listPage(q: SkillListQuery): Promise<{ rows: SkillDefinition[]; total: number }> {
    const needle = q.q ? normalizeSearch(q.q) : "";
    const all = [...this.rows.values()]
      .filter((s) => (q.category ? s.category === q.category : true))
      .filter((s) => (q.active === undefined ? true : s.isActive === q.active))
      .filter((s) => !needle || normalizeSearch(s.name).includes(needle) || s.code.includes(needle.replace(/\s+/g, "-")))
      .sort(byOrder);
    const start = (q.page - 1) * q.limit;
    return { rows: all.slice(start, start + q.limit).map(clone), total: all.length };
  }

  async count(): Promise<number> {
    return this.rows.size;
  }

  async create(input: CreateSkillInput): Promise<SkillDefinition> {
    if ([...this.rows.values()].some((s) => s.code === input.code)) throw new UniqueViolationError(`SkillDefinition.code:${input.code}`);
    const now = new Date();
    const row: SkillDefinition = { ...input, id: newObjectId(), version: 1, updatedBy: input.createdBy, createdAt: now, updatedAt: now };
    this.rows.set(row.id, row);
    return clone(row);
  }

  async updateCas(id: string, expectedVersion: number, patch: SkillPatch): Promise<SkillDefinition | null> {
    const cur = this.rows.get(id);
    if (!cur || cur.version !== expectedVersion) return null;
    const next: SkillDefinition = { ...cur, ...patch, version: cur.version + 1, updatedAt: new Date() };
    this.rows.set(id, next);
    return clone(next);
  }
}
