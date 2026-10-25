import { Prisma, type SkillDefinition as PrismaSkill } from "@prisma/client";
import { escapeRegex } from "../../../core/utils/escape-regex";
import { normalizeSearch } from "../../../core/utils/normalize";
import { prisma } from "../../../infrastructure/database";
import type { SkillDefinition } from "../entities/skill.interface";
import type { CreateSkillInput, ISkillDefinitionRepository, SkillListQuery, SkillPatch } from "./skill-definition.repository.interface";
import { isPrismaUniqueViolation, mapUnique, type TxHandle } from "./tx";

const ORDER: Prisma.SkillDefinitionOrderByWithRelationInput[] = [{ order: "asc" }, { name: "asc" }];

export function toSkill(r: PrismaSkill): SkillDefinition {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description ?? null,
    category: r.category,
    labelMatch: r.labelMatch,
    criteria: {
      requiredTasksDone: r.criteria.requiredTasksDone,
      minStoryPointsX10: r.criteria.minStoryPointsX10 ?? null,
      minAvgPeerScoreX10: r.criteria.minAvgPeerScoreX10 ?? null,
      requireReview: r.criteria.requireReview,
    },
    icon: r.icon,
    isActive: r.isActive,
    order: r.order,
    version: r.version,
    createdBy: r.createdBy ?? null,
    updatedBy: r.updatedBy ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export class PrismaSkillDefinitionRepository implements ISkillDefinitionRepository {
  async findById(id: string): Promise<SkillDefinition | null> {
    const r = await prisma.skillDefinition.findUnique({ where: { id } });
    return r ? toSkill(r) : null;
  }

  async findByIds(ids: readonly string[]): Promise<SkillDefinition[]> {
    if (ids.length === 0) return [];
    return (await prisma.skillDefinition.findMany({ where: { id: { in: [...ids] } }, orderBy: ORDER })).map(toSkill);
  }

  async findByCode(code: string): Promise<SkillDefinition | null> {
    const r = await prisma.skillDefinition.findUnique({ where: { code } });
    return r ? toSkill(r) : null;
  }

  async findByLabels(labels: readonly string[]): Promise<SkillDefinition[]> {
    if (labels.length === 0) return [];
    return (await prisma.skillDefinition.findMany({ where: { labelMatch: { hasSome: [...labels] } }, orderBy: ORDER })).map(toSkill);
  }

  async listActive(): Promise<SkillDefinition[]> {
    return (await prisma.skillDefinition.findMany({ where: { isActive: true }, orderBy: ORDER })).map(toSkill);
  }

  async listAll(): Promise<SkillDefinition[]> {
    return (await prisma.skillDefinition.findMany({ orderBy: ORDER })).map(toSkill);
  }

  async listPage(query: SkillListQuery): Promise<{ rows: SkillDefinition[]; total: number }> {
    const where: Prisma.SkillDefinitionWhereInput = {
      ...(query.category && { category: query.category }),
      ...(query.active !== undefined && { isActive: query.active }),
    };
    const needle = query.q ? normalizeSearch(query.q) : "";
    // `contains` của Prisma-Mongo là `$regex` KHÔNG escape → bọc `escapeRegex` (chuỗi người dùng chỉ khớp literal).
    if (needle) where.OR = [{ normalizedName: { contains: escapeRegex(needle) } }, { code: { contains: escapeRegex(needle.replace(/\s+/g, "-")) } }];
    const [rows, total] = await Promise.all([
      prisma.skillDefinition.findMany({ where, orderBy: ORDER, skip: (query.page - 1) * query.limit, take: query.limit }),
      prisma.skillDefinition.count({ where }),
    ]);
    return { rows: rows.map(toSkill), total };
  }

  count(): Promise<number> {
    return prisma.skillDefinition.count();
  }

  async create(input: CreateSkillInput): Promise<SkillDefinition> {
    const r = await mapUnique(`SkillDefinition.code:${input.code}`, () =>
      prisma.skillDefinition.create({
        data: {
          code: input.code,
          name: input.name,
          normalizedName: normalizeSearch(input.name),
          description: input.description,
          category: input.category,
          labelMatch: input.labelMatch,
          criteria: input.criteria,
          icon: input.icon,
          order: input.order,
          isActive: input.isActive,
          createdBy: input.createdBy,
          updatedBy: input.createdBy,
        },
      })
    );
    return toSkill(r);
  }

  async updateCas(id: string, expectedVersion: number, patch: SkillPatch, tx?: TxHandle): Promise<SkillDefinition | null> {
    const db = tx ?? prisma;
    const { name, ...rest } = patch;
    const data: Prisma.SkillDefinitionUpdateManyMutationInput = {
      ...rest,
      ...(name !== undefined && { name, normalizedName: normalizeSearch(name) }),
      version: { increment: 1 },
    };
    try {
      const res = await db.skillDefinition.updateMany({ where: { id, version: expectedVersion }, data });
      if (res.count === 0) return null;
    } catch (err) {
      if (isPrismaUniqueViolation(err)) return null;
      throw err;
    }
    const r = await db.skillDefinition.findUnique({ where: { id } });
    return r ? toSkill(r) : null;
  }
}
