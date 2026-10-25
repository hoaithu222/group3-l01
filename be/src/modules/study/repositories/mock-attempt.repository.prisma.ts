import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { FillMatchModeValue, StudyItemTypeValue } from "../entities/study-item.interface";
import {
  activeKeyOf,
  doneKeyOf,
  type MockAttempt,
  type MockAttemptCreateInput,
  type MockAttemptStatusValue,
  type MockEventPatch,
  type MockFinalizePatch,
  type MockQuestion,
  type MockSubmitModeValue,
} from "../entities/mock.interface";
import { isPrismaUniqueViolation, UniqueViolationError } from "./errors";
import type { IMockAttemptRepository, MockAttemptListParams } from "./mock-attempt.repository.interface";
import type { TxHandle } from "./tx";

type MockAttemptRecord = Awaited<ReturnType<typeof prisma.mockAttempt.findFirstOrThrow>>;

function toQuestion(q: MockAttemptRecord["questions"][number]): MockQuestion {
  return {
    itemId: q.itemId,
    type: q.type as StudyItemTypeValue,
    prompt: q.prompt,
    options: q.options.map((o) => ({ id: o.id, text: o.text, mediaAssetId: o.mediaAssetId ?? null })),
    correctOptionIds: q.correctOptionIds,
    acceptedAnswers: q.acceptedAnswers,
    matchMode: q.matchMode as FillMatchModeValue,
    explanation: q.explanation ?? null,
    frontMediaAssetId: q.frontMediaAssetId ?? null,
    tags: q.tags,
  };
}

export function toMockAttempt(r: MockAttemptRecord): MockAttempt {
  return {
    id: r.id,
    userId: r.userId,
    setId: r.setId,
    setTitle: r.setTitle,
    setVersion: r.setVersion,
    config: { count: r.config.count, durationSec: r.config.durationSec, shuffle: r.config.shuffle, passPct: r.config.passPct },
    questions: r.questions.map(toQuestion),
    status: r.status as MockAttemptStatusValue,
    activeKey: r.activeKey,
    startedAt: r.startedAt,
    expiresAt: r.expiresAt,
    submittedAt: r.submittedAt,
    submitMode: (r.submitMode as MockSubmitModeValue | null) ?? null,
    answeredCount: r.answeredCount,
    correctCount: r.correctCount,
    scorePct: r.scorePct,
    passed: r.passed,
    byTag: r.byTag.map((t) => ({ tag: t.tag, correct: t.correct, total: t.total })),
    backgroundCount: r.backgroundCount,
    backgroundMs: r.backgroundMs,
    lastBackgroundAt: r.lastBackgroundAt,
    eventCount: r.eventCount,
    version: r.version,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export class PrismaMockAttemptRepository implements IMockAttemptRepository {
  async create(input: MockAttemptCreateInput, tx?: TxHandle): Promise<MockAttempt> {
    try {
      const record = await (tx ?? prisma).mockAttempt.create({
        data: {
          id: input.id,
          userId: input.userId,
          setId: input.setId,
          setTitle: input.setTitle,
          setVersion: input.setVersion,
          config: input.config,
          questions: input.questions.map((q) => ({ ...q, options: q.options.map((o) => ({ id: o.id, text: o.text, mediaAssetId: o.mediaAssetId })) })),
          status: "IN_PROGRESS",
          activeKey: activeKeyOf(input.userId, input.setId),
          startedAt: input.startedAt,
          expiresAt: input.expiresAt,
          // Quy ước Mongo: trường về sau lọc/đọc bằng null phải ghi `null` TƯỜNG MINH lúc tạo.
          submittedAt: null,
          submitMode: null,
          correctCount: null,
          scorePct: null,
          passed: null,
          lastBackgroundAt: null,
          byTag: [],
        },
      });
      return toMockAttempt(record);
    } catch (err) {
      if (isPrismaUniqueViolation(err)) throw new UniqueViolationError("MockAttempt.activeKey");
      throw err;
    }
  }

  async findById(id: string, tx?: TxHandle): Promise<MockAttempt | null> {
    const record = await (tx ?? prisma).mockAttempt.findUnique({ where: { id } });
    return record ? toMockAttempt(record) : null;
  }

  async findActive(userId: string, setId: string): Promise<MockAttempt | null> {
    const record = await prisma.mockAttempt.findUnique({ where: { activeKey: activeKeyOf(userId, setId) } });
    return record ? toMockAttempt(record) : null;
  }

  async finalizeIf(id: string, patch: MockFinalizePatch, tx?: TxHandle): Promise<MockAttempt | null> {
    const db = tx ?? prisma;
    const result = await db.mockAttempt.updateMany({
      where: { id, status: "IN_PROGRESS" },
      data: {
        status: patch.status,
        activeKey: doneKeyOf(id),
        submitMode: patch.submitMode,
        submittedAt: patch.submittedAt,
        answeredCount: patch.answeredCount,
        correctCount: patch.correctCount,
        scorePct: patch.scorePct,
        passed: patch.passed,
        byTag: { set: patch.byTag.map((t) => ({ tag: t.tag, correct: t.correct, total: t.total })) },
        version: { increment: 1 },
      },
    });
    if (result.count === 0) return null;
    return this.findById(id, tx);
  }

  async setAnsweredCount(id: string, count: number): Promise<void> {
    await prisma.mockAttempt.updateMany({ where: { id, status: "IN_PROGRESS" }, data: { answeredCount: count } });
  }

  async applyEvent(id: string, expectedEventCount: number, patch: MockEventPatch): Promise<boolean> {
    const data: Prisma.MockAttemptUpdateManyMutationInput = {
      eventCount: { increment: 1 },
      lastBackgroundAt: patch.lastBackgroundAt,
      ...(patch.backgroundCount !== undefined && { backgroundCount: patch.backgroundCount }),
      ...(patch.backgroundMs !== undefined && { backgroundMs: patch.backgroundMs }),
    };
    const result = await prisma.mockAttempt.updateMany({ where: { id, status: "IN_PROGRESS", eventCount: expectedEventCount }, data });
    return result.count > 0;
  }

  countStartedSince(userId: string, setId: string, since: Date): Promise<number> {
    return prisma.mockAttempt.count({ where: { userId, setId, startedAt: { gte: since } } });
  }

  async list(params: MockAttemptListParams): Promise<MockAttempt[]> {
    const after = params.after;
    const where: Prisma.MockAttemptWhereInput = {
      userId: params.userId,
      ...(params.setId && { setId: params.setId }),
      ...(after && { OR: [{ startedAt: { lt: after.at } }, { startedAt: after.at, id: { lt: after.id } }] }),
    };
    const records = await prisma.mockAttempt.findMany({ where, orderBy: [{ startedAt: "desc" }, { id: "desc" }], take: params.limit });
    return records.map(toMockAttempt);
  }

  async deleteByUser(userId: string): Promise<number> {
    return (await prisma.mockAttempt.deleteMany({ where: { userId } })).count;
  }
}
