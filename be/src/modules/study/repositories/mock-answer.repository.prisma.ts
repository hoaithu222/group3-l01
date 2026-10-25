import { prisma } from "../../../infrastructure/database";
import type { MockAnswer, MockAnswerGrade, MockAnswerInput } from "../entities/mock.interface";
import { isPrismaUniqueViolation } from "./errors";
import type { IMockAnswerRepository } from "./mock-answer.repository.interface";
import type { TxHandle } from "./tx";

type MockAnswerRecord = Awaited<ReturnType<typeof prisma.mockAnswer.findFirstOrThrow>>;

function toMockAnswer(r: MockAnswerRecord): MockAnswer {
  return {
    id: r.id,
    attemptId: r.attemptId,
    userId: r.userId,
    itemId: r.itemId,
    optionIds: r.optionIds,
    text: r.text,
    timeMs: r.timeMs,
    correct: r.correct,
    partial: r.partial,
    answeredAt: r.answeredAt,
  };
}

export class PrismaMockAnswerRepository implements IMockAnswerRepository {
  async upsertMany(attemptId: string, userId: string, answers: readonly MockAnswerInput[], at: Date): Promise<void> {
    await Promise.all(answers.map((a) => this.upsertOne(attemptId, userId, a, at)));
  }

  /** `updateMany` trước, chưa có mới `create`; đua tạo cùng `(attemptId, itemId)` → P2002 → cập nhật lại (NGOÀI transaction nên bắt được). */
  private async upsertOne(attemptId: string, userId: string, a: MockAnswerInput, at: Date): Promise<void> {
    const data = { optionIds: a.optionIds, text: a.text, timeMs: a.timeMs, answeredAt: at };
    const updated = await prisma.mockAnswer.updateMany({ where: { attemptId, itemId: a.itemId }, data });
    if (updated.count > 0) return;
    try {
      // `correct`/`partial` ghi null TƯỜNG MINH (Mongo: vắng mặt ≠ null).
      await prisma.mockAnswer.create({ data: { attemptId, userId, itemId: a.itemId, ...data, correct: null, partial: null } });
    } catch (err) {
      if (!isPrismaUniqueViolation(err)) throw err;
      await prisma.mockAnswer.updateMany({ where: { attemptId, itemId: a.itemId }, data });
    }
  }

  async deleteMany(attemptId: string, itemIds: readonly string[]): Promise<void> {
    if (itemIds.length === 0) return;
    await prisma.mockAnswer.deleteMany({ where: { attemptId, itemId: { in: [...itemIds] } } });
  }

  async listByAttempt(attemptId: string, tx?: TxHandle): Promise<MockAnswer[]> {
    return (await (tx ?? prisma).mockAnswer.findMany({ where: { attemptId } })).map(toMockAnswer);
  }

  countByAttempt(attemptId: string): Promise<number> {
    return prisma.mockAnswer.count({ where: { attemptId } });
  }

  async markGraded(grades: readonly MockAnswerGrade[], tx?: TxHandle): Promise<void> {
    const db = tx ?? prisma;
    const groups = new Map<string, { correct: boolean; partial: number | null; ids: string[] }>();
    for (const g of grades) {
      const key = `${g.correct}:${g.partial ?? "n"}`;
      const group = groups.get(key) ?? { correct: g.correct, partial: g.partial, ids: [] };
      group.ids.push(g.id);
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      await db.mockAnswer.updateMany({ where: { id: { in: group.ids } }, data: { correct: group.correct, partial: group.partial } });
    }
  }

  async deleteByUser(userId: string): Promise<number> {
    return (await prisma.mockAnswer.deleteMany({ where: { userId } })).count;
  }
}
