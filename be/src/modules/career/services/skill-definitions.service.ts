import { NotFoundError, ValidationError, VersionConflictError } from "../../../core/exceptions";
import { LIMITS } from "../../../core/constants/limits";
import type { AuthUser } from "../../../core/types/express";
import { normalizeSkillLabel } from "../../../core/utils/normalize";
import { isCriteriaHarder, skillCriteriaSchema, toDisplayCriteria, toStoredCriteria, type StoredSkillCriteria } from "../../../shared/criteria/skill-criteria";
import type { CreateSkillDto, UpdateSkillDto } from "../dtos";
import type { SkillDefinition } from "../entities/skill.interface";
import type { ISkillBadgeRepository } from "../repositories/skill-badge.repository.interface";
import type { ISkillDefinitionRepository, SkillPatch } from "../repositories/skill-definition.repository.interface";
import { UniqueViolationError, type ICareerOutbox, type ITxRunner } from "../repositories/tx";
import type { ICareerAudit } from "./career.ports";
import { reevaluateSkillRow } from "./skill-reevaluate.rows";
import { invalidCriteria, skillCodeTaken, tooManySkills } from "./skill-errors";
import { presentAdminSkill, type AdminSkillDto } from "./skill-admin.presenter";

export interface SkillDefinitionsDeps {
  definitions: ISkillDefinitionRepository;
  badges: ISkillBadgeRepository;
  tx: ITxRunner;
  outbox: ICareerOutbox;
  audit: ICareerAudit;
}

/** Tiêu chí thô → dạng lưu (×10); sai → `SKILL_002` kèm lỗi từng trường. */
export function parseSkillCriteria(raw: unknown): StoredSkillCriteria {
  const parsed = skillCriteriaSchema.safeParse(raw);
  if (!parsed.success) throw invalidCriteria(parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
  return toStoredCriteria(parsed.data);
}

/** Nhãn khớp → dạng chuẩn hoá, bỏ trùng; nhãn rỗng sau chuẩn hoá ("..." / "!!") → 400. */
export function normalizeLabels(labels: readonly string[]): string[] {
  const out = [...new Set(labels.map(normalizeSkillLabel))];
  if (out.some((l) => l === "")) throw new ValidationError("Nhãn khớp phải có ít nhất một chữ hoặc số", [{ field: "labelMatch", message: "Nhãn không hợp lệ" }]);
  return out;
}

/**
 * Danh mục kỹ năng do vận hành quản (`skill:create|update`, admin.md §2.1–2.2). Tạo mới luôn TẮT; bật hoặc đổi tiêu chí/nhãn khi đang bật → xếp job
 * `skill.reevaluate-skill` qua outbox CÙNG transaction (cấp cho người mới đủ — không thu hồi huy hiệu đã cấp, CR-24). Mọi thao tác ghi có audit.
 */
export class SkillDefinitionsService {
  constructor(private readonly d: SkillDefinitionsDeps) {}

  async list(query: { page: number; limit: number; q?: string; category?: SkillDefinition["category"]; active?: boolean }) {
    const { rows, total } = await this.d.definitions.listPage(query);
    const holders = await this.d.badges.holdersCount(rows.map((r) => r.id));
    return {
      data: rows.map((s) => presentAdminSkill(s, holders.get(s.id) ?? 0)),
      meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit), hasNext: query.page * query.limit < total, hasPrev: query.page > 1 },
    };
  }

  async get(id: string): Promise<AdminSkillDto> {
    const skill = await this.require(id);
    return presentAdminSkill(skill, (await this.d.badges.holdersCount([id])).get(id) ?? 0);
  }

  async create(actor: AuthUser, dto: CreateSkillDto): Promise<AdminSkillDto> {
    const criteria = parseSkillCriteria(dto.criteria);
    const labelMatch = normalizeLabels(dto.labelMatch);
    if ((await this.d.definitions.count()) >= LIMITS.skill.definitionsMax) throw tooManySkills(LIMITS.skill.definitionsMax);
    let skill: SkillDefinition;
    try {
      skill = await this.d.definitions.create({
        code: dto.code,
        name: dto.name,
        description: dto.description ?? null,
        category: dto.category,
        labelMatch,
        criteria,
        icon: dto.icon,
        order: dto.order,
        isActive: false,
        createdBy: actor.id,
      });
    } catch (err) {
      if (err instanceof UniqueViolationError) throw skillCodeTaken(dto.code);
      throw err;
    }
    await this.d.audit.record({ actorId: actor.id, actorRole: actor.role, action: "skill.create", targetType: "SkillDefinition", targetId: skill.id, metadata: { code: skill.code } });
    return presentAdminSkill(skill, 0);
  }

  async update(actor: AuthUser, id: string, dto: UpdateSkillDto): Promise<AdminSkillDto & { criteriaHarder: boolean }> {
    const cur = await this.require(id);
    if (cur.version !== dto.expectedVersion) throw new VersionConflictError(cur.version);
    const patch: SkillPatch = { updatedBy: actor.id };
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.description !== undefined) patch.description = dto.description ?? null;
    if (dto.category !== undefined) patch.category = dto.category;
    if (dto.icon !== undefined) patch.icon = dto.icon;
    if (dto.order !== undefined) patch.order = dto.order;
    if (dto.labelMatch !== undefined) patch.labelMatch = normalizeLabels(dto.labelMatch);
    if (dto.criteria !== undefined) patch.criteria = parseSkillCriteria(dto.criteria);
    const reevaluate = cur.isActive && (patch.criteria !== undefined || patch.labelMatch !== undefined);
    const next = await this.d.tx.run(async (tx) => {
      const saved = await this.d.definitions.updateCas(id, dto.expectedVersion, patch, tx);
      if (saved && reevaluate) await this.d.outbox.add(tx, reevaluateSkillRow(saved));
      return saved;
    });
    if (!next) throw new VersionConflictError((await this.require(id)).version);
    const criteriaHarder = patch.criteria !== undefined && isCriteriaHarder(cur.criteria, patch.criteria);
    await this.d.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "skill.update",
      targetType: "SkillDefinition",
      targetId: id,
      reason: dto.reason,
      metadata: { code: cur.code, fields: Object.keys(patch).filter((k) => k !== "updatedBy"), criteriaHarder, before: toDisplayCriteria(cur.criteria) },
    });
    return { ...presentAdminSkill(next, (await this.d.badges.holdersCount([id])).get(id) ?? 0), criteriaHarder };
  }

  /** Bật/tắt (lý do bắt buộc). Bật → đánh giá lại kỹ năng (cấp cho người đã đủ). Trạng thái không đổi → trả nguyên, không audit. */
  async setActive(actor: AuthUser, id: string, active: boolean, reason: string): Promise<AdminSkillDto> {
    const cur = await this.require(id);
    if (cur.isActive === active) return this.get(id);
    const next = await this.d.tx.run(async (tx) => {
      const saved = await this.d.definitions.updateCas(id, cur.version, { isActive: active, updatedBy: actor.id }, tx);
      if (saved && active) await this.d.outbox.add(tx, reevaluateSkillRow(saved));
      return saved;
    });
    if (!next) throw new VersionConflictError((await this.require(id)).version);
    await this.d.audit.record({ actorId: actor.id, actorRole: actor.role, action: active ? "skill.activate" : "skill.deactivate", targetType: "SkillDefinition", targetId: id, reason, metadata: { code: cur.code } });
    return presentAdminSkill(next, (await this.d.badges.holdersCount([id])).get(id) ?? 0);
  }

  async require(id: string): Promise<SkillDefinition> {
    const skill = await this.d.definitions.findById(id);
    if (!skill) throw new NotFoundError("Không tìm thấy kỹ năng");
    return skill;
  }
}
