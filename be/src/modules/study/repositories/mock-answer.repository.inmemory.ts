import { newObjectId } from "../../../core/utils/object-id";
import type { MockAnswer, MockAnswerGrade, MockAnswerInput } from "../entities/mock.interface";
import type { IMockAnswerRepository } from "./mock-answer.repository.interface";

export class InMemoryMockAnswerRepository implements IMockAnswerRepository {
  readonly rows = new Map<string, MockAnswer>();

  private find(attemptId: string, itemId: string): MockAnswer | undefined {
    return [...this.rows.values()].find((r) => r.attemptId === attemptId && r.itemId === itemId);
  }

  upsertMany(attemptId: string, userId: string, answers: readonly MockAnswerInput[], at: Date): Promise<void> {
    for (const a of answers) {
      const existing = this.find(attemptId, a.itemId);
      if (existing) Object.assign(existing, { optionIds: [...a.optionIds], text: a.text, timeMs: a.timeMs, answeredAt: at });
      else {
        const id = newObjectId();
        this.rows.set(id, { id, attemptId, userId, itemId: a.itemId, optionIds: [...a.optionIds], text: a.text, timeMs: a.timeMs, correct: null, partial: null, answeredAt: at });
      }
    }
    return Promise.resolve();
  }

  deleteMany(attemptId: string, itemIds: readonly string[]): Promise<void> {
    for (const [id, r] of this.rows) if (r.attemptId === attemptId && itemIds.includes(r.itemId)) this.rows.delete(id);
    return Promise.resolve();
  }

  listByAttempt(attemptId: string): Promise<MockAnswer[]> {
    return Promise.resolve([...this.rows.values()].filter((r) => r.attemptId === attemptId).map((r) => structuredClone(r)));
  }

  countByAttempt(attemptId: string): Promise<number> {
    return Promise.resolve([...this.rows.values()].filter((r) => r.attemptId === attemptId).length);
  }

  markGraded(grades: readonly MockAnswerGrade[]): Promise<void> {
    for (const g of grades) {
      const r = this.rows.get(g.id);
      if (r) Object.assign(r, { correct: g.correct, partial: g.partial });
    }
    return Promise.resolve();
  }

  deleteByUser(userId: string): Promise<number> {
    let n = 0;
    for (const [id, r] of this.rows) if (r.userId === userId) (this.rows.delete(id), (n += 1));
    return Promise.resolve(n);
  }
}
