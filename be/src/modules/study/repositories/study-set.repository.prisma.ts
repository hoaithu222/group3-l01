import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import { escapeRegex } from "../../../core/utils/escape-regex";
import type {
  PopularTag,
  StudyOwnerSummary,
  StudySet,
  StudySetAdminListParams,
  StudySetCreateInput,
  StudySetListParams,
  StudySetPatch,
  StudySetStatusValue,
  StudySetUpdateCondition,
  StudyVisibilityValue,
} from "../entities/study-set.interface";
import type { IStudySetRepository } from "./study-set.repository.interface";
import type { TxHandle } from "./tx";

type StudySetRecord = Awaited<ReturnType<typeof prisma.studySet.findFirstOrThrow>>;

export function toStudySet(r: StudySetRecord): StudySet {
  return {
    id: r.id,
    ownerId: r.ownerId,
    workspaceId: r.workspaceId,
    title: r.title,
    normalizedTitle: r.normalizedTitle,
    description: r.description,
    tags: r.tags,
    coverAssetId: r.coverAssetId,
    language: r.language,
    visibility: r.visibility as StudyVisibilityValue,
    status: r.status as StudySetStatusValue,
    hiddenReason: r.hiddenReason,
    hiddenBy: r.hiddenBy,
    hiddenAt: r.hiddenAt,
    itemCount: r.itemCount,
    itemTypesMask: r.itemTypesMask,
    reportedCount: r.reportedCount,
    copiedFromId: r.copiedFromId,
    copyCount: r.copyCount,
    version: r.version,
    deletedAt: r.deletedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** Chỉ các khoá có mặt trong `patch` được ghi (`undefined` = giữ nguyên, `null` = xoá). */
function patchData(patch: StudySetPatch): Prisma.StudySetUncheckedUpdateManyInput {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) if (value !== undefined) out[key] = value;
  return out as Prisma.StudySetUncheckedUpdateManyInput;
}

function listWhere(p: StudySetListParams): Prisma.StudySetWhereInput {
  const and: Prisma.StudySetWhereInput[] = [];
  // Prisma+Mongo dịch `contains` thành `$regex` KHÔNG thoát ký tự đặc biệt → tự escape (chống ReDoS/regex injection).
  for (const term of p.terms ?? []) and.push({ normalizedTitle: { contains: escapeRegex(term) } });
  if (p.after) {
    and.push({ OR: [{ updatedAt: { lt: p.after.at } }, { updatedAt: p.after.at, id: { lt: p.after.id } }] });
  }

  let scope: Prisma.StudySetWhereInput;
  if (p.scope === "mine") {
    scope = { ownerId: p.viewerId, status: { in: ["ACTIVE", "HIDDEN"] } };
  } else if (p.scope === "workspace") {
    const visibleStatus: Prisma.StudySetWhereInput = p.includeHidden
      ? { status: { in: ["ACTIVE", "HIDDEN"] } }
      : { OR: [{ status: "ACTIVE" }, { status: "HIDDEN", ownerId: p.viewerId }] };
    scope = { workspaceId: p.workspaceId, visibility: "WORKSPACE", ...visibleStatus };
  } else {
    scope = { visibility: "PUBLIC", status: "ACTIVE" };
  }

  return {
    ...scope,
    deletedAt: null,
    ...(p.tag && { tags: { has: p.tag } }),
    // Mask ≥ 2 ⇔ có ít nhất một loại ngoài FLASHCARD (bit 1) — không cần toán tử bit trong Mongo.
    ...(p.hasQuiz && { itemTypesMask: { gt: 1 } }),
    ...(and.length > 0 && { AND: and }),
  };
}

export class PrismaStudySetRepository implements IStudySetRepository {
  async findById(id: string, tx?: TxHandle): Promise<StudySet | null> {
    const record = await (tx ?? prisma).studySet.findUnique({ where: { id } });
    return record ? toStudySet(record) : null;
  }

  async findByIds(ids: string[]): Promise<StudySet[]> {
    if (ids.length === 0) return [];
    return (await prisma.studySet.findMany({ where: { id: { in: ids } } })).map(toStudySet);
  }

  async create(input: StudySetCreateInput, tx?: TxHandle): Promise<StudySet> {
    const record = await (tx ?? prisma).studySet.create({
      data: {
        ...input,
        // Quy ước Mongo: trường về sau lọc bằng `{ field: null }` phải ghi `null` TƯỜNG MINH lúc tạo.
        hiddenReason: null,
        hiddenBy: null,
        hiddenAt: null,
        deletedAt: null,
        reportedCount: 0,
        copyCount: 0,
        version: 1,
        status: "ACTIVE",
      },
    });
    return toStudySet(record);
  }

  async updateIf(id: string, cond: StudySetUpdateCondition, patch: StudySetPatch, tx?: TxHandle): Promise<StudySet | null> {
    const db = tx ?? prisma;
    const result = await db.studySet.updateMany({
      where: {
        id,
        ...(cond.version !== undefined && { version: cond.version }),
        ...(cond.statusIn && { status: { in: [...cond.statusIn] } }),
      },
      data: { ...patchData(patch), version: { increment: 1 } },
    });
    return result.count === 0 ? null : this.findById(id, tx);
  }

  async list(params: StudySetListParams): Promise<StudySet[]> {
    const records = await prisma.studySet.findMany({
      where: listWhere(params),
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: params.limit,
    });
    return records.map(toStudySet);
  }

  countByOwner(ownerId: string): Promise<number> {
    return prisma.studySet.count({ where: { ownerId, deletedAt: null } });
  }

  async listAdminReported(p: StudySetAdminListParams): Promise<{ rows: StudySet[]; total: number }> {
    const where: Prisma.StudySetWhereInput = {
      visibility: "PUBLIC",
      deletedAt: null,
      status: p.status ?? { in: ["ACTIVE", "HIDDEN"] },
      reportedCount: { gte: p.minReported },
    };
    const [rows, total] = await Promise.all([
      prisma.studySet.findMany({ where, orderBy: [{ reportedCount: "desc" }, { updatedAt: "desc" }, { id: "desc" }], skip: (p.page - 1) * p.limit, take: p.limit }),
      prisma.studySet.count({ where }),
    ]);
    return { rows: rows.map(toStudySet), total };
  }

  async ownerSummary(ownerId: string): Promise<StudyOwnerSummary> {
    const base: Prisma.StudySetWhereInput = { ownerId, deletedAt: null };
    const [total, pub, workspace, priv, hidden] = await Promise.all([
      prisma.studySet.count({ where: base }),
      prisma.studySet.count({ where: { ...base, visibility: "PUBLIC" } }),
      prisma.studySet.count({ where: { ...base, visibility: "WORKSPACE" } }),
      prisma.studySet.count({ where: { ...base, visibility: "PRIVATE" } }),
      prisma.studySet.count({ where: { ...base, status: "HIDDEN" } }),
    ]);
    return { total, public: pub, workspace, private: priv, hidden };
  }

  async incCopyCount(id: string): Promise<void> {
    await prisma.studySet.updateMany({ where: { id }, data: { copyCount: { increment: 1 } } });
  }

  async setReportedCount(id: string, count: number): Promise<void> {
    await prisma.studySet.updateMany({ where: { id }, data: { reportedCount: count } });
  }

  async popularTags(params: { workspaceId?: string; limit: number }): Promise<PopularTag[]> {
    const match: Prisma.InputJsonObject = params.workspaceId
      ? { workspaceId: { $oid: params.workspaceId }, visibility: "WORKSPACE", status: "ACTIVE" }
      : { visibility: "PUBLIC", status: "ACTIVE" };
    const rows = (await prisma.studySet.aggregateRaw({
      pipeline: [
        { $match: match },
        { $unwind: "$tags" },
        { $group: { _id: "$tags", count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: params.limit },
      ],
    })) as unknown as Array<{ _id: string; count: number }>;
    return rows.map((r) => ({ tag: r._id, count: r.count }));
  }
}
