import type { StudyItem } from "../../entities/study-item.interface";
import { InMemoryMockAnswerRepository } from "../../repositories/mock-answer.repository.inmemory";
import { InMemoryMockAttemptRepository } from "../../repositories/mock-attempt.repository.inmemory";
import { InMemoryEventDedupe, InMemoryStudyNotifier } from "../../repositories/ports";
import { InMemorySrProgressRepository } from "../../repositories/sr-progress.repository.inmemory";
import { InMemorySrReviewLogRepository } from "../../repositories/sr-review-log.repository.inmemory";
import { InMemoryTxRunner } from "../../repositories/tx";
import { MockAttemptService } from "../../services/mock-attempt.service";
import { SrReminderService } from "../../services/sr-reminder.service";
import { SrReviewService } from "../../services/sr-review.service";
import { SrService } from "../../services/sr.service";
import { StudyUserDataEraser } from "../../services/study-user-data.eraser";
import { AUTHOR, makeHarness, mc, flash, type Harness } from "./harness";

/** Câu điền chỗ trống mẫu (đáp án chấp nhận: "hà nội"). */
export const fill = (key: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: "FILL_BLANK",
  clientItemKey: key,
  prompt: `Điền ${key}`,
  acceptedAnswers: ["hà nội"],
  matchMode: "IGNORE_CASE",
  ...extra,
});

/** `random` tất định: luôn chọn phần tử cuối (`max − 1`) — kết quả xáo có thể đoán trước. */
export const lastRandom = (max: number): number => max - 1;
/** `random` tất định: luôn 0. */
export const zeroRandom = (): number => 0;

/**
 * Harness thi thử + ôn tập trên repository in-memory, dựng TRÊN harness bộ học p4-01 (`makeHarness`): dùng chung bộ/mục/quyền/đồng hồ
 * (`clock.now`) — đổi `h.clock.now` để "đi qua thời gian". Outbox và thông báo ghi lại để khẳng định.
 */
export function makeLearningHarness(overrides: { random?: (max: number) => number } = {}) {
  const base = makeHarness();
  const now = () => new Date(base.clock.now);
  const attempts = new InMemoryMockAttemptRepository();
  const answers = new InMemoryMockAnswerRepository();
  const progress = new InMemorySrProgressRepository();
  const enrollments = base.enrollments; // cùng kho với `base.setService` — để `srEnrolled` phản ánh đăng ký/ngừng ôn
  const logs = new InMemorySrReviewLogRepository();
  const notifier = new InMemoryStudyNotifier();
  const events = new InMemoryEventDedupe();
  for (const repo of [attempts, progress, enrollments]) repo.now = now;

  const tx = new InMemoryTxRunner();
  const srDeps = { sets: base.sets, items: base.items, access: base.access, progress, enrollments, logs, tx, users: base.users, outbox: base.outbox, notifier, now };
  const sr = new SrService(srDeps);
  const mock = new MockAttemptService({
    sets: base.sets,
    items: base.items,
    attempts,
    answers,
    progress,
    tx,
    access: base.access,
    users: base.users,
    outbox: base.outbox,
    notifier,
    events,
    now,
    random: overrides.random ?? zeroRandom,
  });

  return {
    ...base,
    now,
    attempts,
    answers,
    progress,
    enrollments,
    logs,
    notifier,
    events,
    mock,
    sr,
    srReview: new SrReviewService(srDeps),
    srReminder: new SrReminderService(srDeps, sr),
    eraser: new StudyUserDataEraser({ attempts, answers, progress, enrollments, logs }),
  };
}

export type LearningHarness = ReturnType<typeof makeLearningHarness>;

/** Bộ PRIVATE của `AUTHOR` với `mcCount` câu trắc nghiệm (đáp án đúng = lựa chọn thứ hai) + `flashCount` thẻ ghi nhớ. */
export async function seedQuizSet(h: Harness, mcCount: number, flashCount = 0, extra: Array<Record<string, unknown>> = []) {
  const set = await h.setService.create(AUTHOR, { title: "Bộ thi thử", tags: [], visibility: "PRIVATE" });
  const upsert = [
    ...Array.from({ length: mcCount }, (_, i) => mc(`q${i + 1}`)),
    ...Array.from({ length: flashCount }, (_, i) => flash(`f${i + 1}`)),
    ...extra,
  ];
  const saved = await h.bulk.save(AUTHOR, set.id, { expectedVersion: set.version, upsert, delete: [] } as never);
  const items: StudyItem[] = await h.items.listBySet(set.id);
  return { setId: set.id, version: saved.version, items };
}
