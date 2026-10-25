import type { Task } from "../../projects/entities/task.interface";
import { completedEvent, reopenedEvent } from "../../projects/events/task-event.factory";
import { TASK_EVENTS, taskEventKeys } from "../../projects/events/project-events";
import { DOMAIN_EVENTS, eventKeys, reviewSubmittedSchema } from "../../../shared/events/domain-events";
import { InMemoryContributionFactRepository } from "../repositories/contribution-fact.repository.inmemory";
import { InMemoryContributionStateRepository } from "../repositories/contribution-state.repository.inmemory";
import { ContributionFactsService } from "../services/contribution-facts.service";
import { FakeConfig, FakeQueue, FakeSource, oid } from "./support/fakes";

/**
 * Hợp đồng sự kiện (README Phase 4 §4): consumer `contribution` PHẢI đọc đúng payload mà producer THẬT dựng (`projects/events/task-event.factory`) và khớp schema
 * `review.submitted` dùng chung (`shared/events/domain-events`). Lệch tên trường ở một phía là lỗi ở đây, không phải lỗi âm thầm trên production.
 */
const task = (over: Partial<Task> = {}): Task => ({
  id: oid(0x31),
  boardId: oid(0x32),
  workspaceId: oid(0x33),
  columnId: "c_done0001",
  columnKind: "DONE",
  position: "a0",
  title: "Thẻ",
  normalizedTitle: "the",
  description: null,
  assigneeIds: [oid(0x41), oid(0x42)],
  labelIds: [],
  startDate: null,
  dueDate: new Date("2026-09-20T10:00:00Z"),
  storyPoints: 5,
  checklist: [],
  checklistDone: 0,
  checklistTotal: 0,
  attachmentCount: 0,
  commentCount: 0,
  reviewState: "NONE",
  completedAt: new Date("2026-09-15T08:00:00Z"),
  completionCount: 1,
  createdBy: oid(0x41),
  clientTaskId: null,
  dueVersion: 0,
  deletedFromColumnId: null,
  deletedAt: null,
  deletedBy: null,
  version: 4,
  createdAt: new Date("2026-09-01T00:00:00Z"),
  updatedAt: new Date(),
  ...over,
});

function setup() {
  const facts = new InMemoryContributionFactRepository();
  const states = new InMemoryContributionStateRepository();
  const service = new ContributionFactsService({ facts, states, source: new FakeSource(), config: new FakeConfig(), queue: new FakeQueue() });
  return { facts, states, service };
}

describe("hợp đồng sự kiện — task.completed / task.reopened (producer p3-02 thật → consumer p4-06)", () => {
  it("payload completedEvent() (có review, taskCreatedAt, labelNames) được consumer đọc đủ trường", async () => {
    const { facts, service } = setup();
    const { payload, dedupeKey } = completedEvent(task(), oid(0x41), ["Backend"], { enabled: true, approved: true, roundId: "r1" });
    expect(dedupeKey).toBe(taskEventKeys.completed(oid(0x31), 1));
    expect(payload.event).toBe(TASK_EVENTS.COMPLETED);
    await service.onTaskCompleted(payload);
    expect(facts.tasks.get(oid(0x31))).toEqual({
      taskId: oid(0x31),
      boardId: oid(0x32),
      workspaceId: oid(0x33),
      assigneeIds: [oid(0x41), oid(0x42)],
      storyPoints: 5,
      dueDate: new Date("2026-09-20T10:00:00Z"),
      completedAt: new Date("2026-09-15T08:00:00Z"),
      completionCount: 1,
      active: true,
      reviewApproved: true,
    });
  });

  it("payload đi qua JSON (outbox → BullMQ) vẫn được đọc đúng: ngày là chuỗi ISO, review mặc định không bật", async () => {
    const { facts, service } = setup();
    const wire = JSON.parse(JSON.stringify(completedEvent(task({ storyPoints: null, dueDate: null }), oid(0x41), []).payload)) as Parameters<typeof service.onTaskCompleted>[0];
    await service.onTaskCompleted(wire);
    expect(facts.tasks.get(oid(0x31))).toMatchObject({ storyPoints: null, dueDate: null, reviewApproved: false, active: true });
  });

  it("reopenedEvent() → vô hiệu đúng lần hoàn thành; completionCount trong dedupeKey khớp trường payload", async () => {
    const { facts, service } = setup();
    await service.onTaskCompleted(completedEvent(task(), oid(0x41), []).payload);
    const done = task({ completionCount: 1, completedAt: null, columnKind: "TODO" });
    const { payload, dedupeKey } = reopenedEvent(done, oid(0x41), new Date("2026-09-16T00:00:00Z"));
    expect(dedupeKey).toBe(taskEventKeys.reopened(oid(0x31), 1));
    expect(payload.completionCount).toBe(1);
    await service.onTaskReopened(payload);
    expect(facts.tasks.get(oid(0x31))?.active).toBe(false);
    // Hoàn thành lại (c2) → hoạt động trở lại với completedAt mới.
    await service.onTaskCompleted(completedEvent(task({ completionCount: 2, completedAt: new Date("2026-09-18T08:00:00Z") }), oid(0x41), []).payload);
    expect(facts.tasks.get(oid(0x31))).toMatchObject({ active: true, completionCount: 2 });
  });
});

describe("hợp đồng sự kiện — review.submitted (schema dùng chung p4-03/p4-06 ↔ p4-05)", () => {
  const minimal = { event: DOMAIN_EVENTS.REVIEW_SUBMITTED, reviewId: oid(0x51), taskId: oid(0x31), reviewerId: oid(0x43), status: "APPROVED", score10: 8.5, submittedAt: "2026-09-15T09:00:00.000Z" };
  const extended = { ...minimal, workspaceId: oid(0x33), boardId: oid(0x32), assigneeIds: [oid(0x41)], roundId: oid(0x52) };

  it("schema chung nhận cả dạng tối thiểu lẫn dạng đầy đủ; dedupeKey theo reviewId", () => {
    expect(reviewSubmittedSchema.safeParse(minimal).success).toBe(true);
    expect(reviewSubmittedSchema.safeParse(extended).success).toBe(true);
    expect(eventKeys.reviewSubmitted(oid(0x51))).toBe(`review.submitted:review:${oid(0x51)}`);
  });

  it("consumer nhận dạng đầy đủ do p4-05 phát (boardId, assigneeIds…) và không lệch với dạng tối thiểu qua nguồn TaskReview", async () => {
    const { facts, service } = setup();
    expect(await service.onReviewSubmitted(extended)).toBe("INSERTED");
    expect(facts.reviews.get(oid(0x51))).toMatchObject({ boardId: oid(0x32), workspaceId: oid(0x33), reviewerId: oid(0x43), assigneeIds: [oid(0x41)], status: "APPROVED", score10: 8.5 });
    expect(await service.onReviewSubmitted(extended)).toBe("DUPLICATE");
  });
});
