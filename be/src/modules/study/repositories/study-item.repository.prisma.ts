import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type {
  FillMatchModeValue,
  StudyItem,
  StudyItemContent,
  StudyItemCreateInput,
  StudyItemTypeValue,
  StudyItemUpdateInput,
} from "../entities/study-item.interface";
import type { IStudyItemRepository, StudyItemListParams } from "./study-item.repository.interface";
import type { TxHandle } from "./tx";

type StudyItemRecord = Awaited<ReturnType<typeof prisma.studyItem.findFirstOrThrow>>;

function toStudyItem(r: StudyItemRecord): StudyItem {
  return {
    id: r.id,
    setId: r.setId,
    ownerId: r.ownerId,
    type: r.type as StudyItemTypeValue,
    prompt: r.prompt,
    answerText: r.answerText,
    options: r.options.map((o) => ({ id: o.id, text: o.text, mediaAssetId: o.mediaAssetId ?? null })),
    correctOptionIds: r.correctOptionIds,
    acceptedAnswers: r.acceptedAnswers,
    matchMode: r.matchMode as FillMatchModeValue,
    explanation: r.explanation,
    frontMediaAssetId: r.frontMediaAssetId,
    backMediaAssetId: r.backMediaAssetId,
    audioAssetId: r.audioAssetId,
    tags: r.tags,
    order: r.order,
    version: r.version,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** Nội dung mục → cột Prisma. Ghi `null` TƯỜNG MINH cho trường tuỳ chọn (Mongo: vắng mặt ≠ null). */
function contentData(c: StudyItemContent) {
  return {
    type: c.type,
    prompt: c.prompt,
    answerText: c.answerText,
    options: c.options.map((o) => ({ id: o.id, text: o.text, mediaAssetId: o.mediaAssetId })),
    correctOptionIds: c.correctOptionIds,
    acceptedAnswers: c.acceptedAnswers,
    matchMode: c.matchMode,
    explanation: c.explanation,
    frontMediaAssetId: c.frontMediaAssetId,
    backMediaAssetId: c.backMediaAssetId,
    audioAssetId: c.audioAssetId,
    tags: c.tags,
  };
}

export class PrismaStudyItemRepository implements IStudyItemRepository {
  async listBySet(setId: string, tx?: TxHandle): Promise<StudyItem[]> {
    const records = await (tx ?? prisma).studyItem.findMany({ where: { setId }, orderBy: [{ order: "asc" }, { id: "asc" }] });
    return records.map(toStudyItem);
  }

  async list(params: StudyItemListParams): Promise<StudyItem[]> {
    const after = params.after;
    const where: Prisma.StudyItemWhereInput = {
      setId: params.setId,
      ...(after && { OR: [{ order: { gt: after.order } }, { order: after.order, id: { gt: after.id } }] }),
    };
    const records = await prisma.studyItem.findMany({ where, orderBy: [{ order: "asc" }, { id: "asc" }], take: params.limit });
    return records.map(toStudyItem);
  }

  async findById(id: string): Promise<StudyItem | null> {
    const record = await prisma.studyItem.findUnique({ where: { id } });
    return record ? toStudyItem(record) : null;
  }

  async findByIds(ids: readonly string[]): Promise<StudyItem[]> {
    if (ids.length === 0) return [];
    return (await prisma.studyItem.findMany({ where: { id: { in: [...ids] } } })).map(toStudyItem);
  }

  async findSetId(itemId: string): Promise<string | null> {
    const record = await prisma.studyItem.findUnique({ where: { id: itemId }, select: { setId: true } });
    return record?.setId ?? null;
  }

  countBySet(setId: string, tx?: TxHandle): Promise<number> {
    return (tx ?? prisma).studyItem.count({ where: { setId } });
  }

  async createMany(items: StudyItemCreateInput[], tx: TxHandle): Promise<void> {
    if (items.length === 0) return;
    await tx.studyItem.createMany({
      data: items.map((i) => ({ id: i.id, setId: i.setId, ownerId: i.ownerId, order: i.order, version: 1, ...contentData(i) })),
    });
  }

  async update(setId: string, id: string, input: StudyItemUpdateInput, tx: TxHandle): Promise<boolean> {
    const { options, ...rest } = contentData(input);
    const result = await tx.studyItem.updateMany({
      where: { id, setId },
      data: {
        ...rest,
        options: { set: options },
        ...(input.order !== undefined && { order: input.order }),
        version: { increment: 1 },
      },
    });
    return result.count > 0;
  }

  async setOrder(setId: string, id: string, order: number, tx: TxHandle): Promise<void> {
    await tx.studyItem.updateMany({ where: { id, setId }, data: { order } });
  }

  async deleteMany(setId: string, ids: string[], tx: TxHandle): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await tx.studyItem.deleteMany({ where: { setId, id: { in: ids } } });
    return result.count;
  }
}
