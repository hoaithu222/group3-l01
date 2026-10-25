import { DOMAIN_EVENTS, eventKeys, reviewAssignedSchema, reviewCancelledSchema, reviewRoundClosedSchema, reviewShortageSchema, reviewSubmittedSchema } from "../../../shared/events/domain-events";
import { mapReviewSubmitted } from "../../gamification/services/xp-source-mapper";
import { InMemoryContributionFactRepository } from "../../contribution/repositories/contribution-fact.repository.inmemory";
import { InMemoryContributionStateRepository } from "../../contribution/repositories/contribution-state.repository.inmemory";
import { ContributionFactsService } from "../../contribution/services/contribution-facts.service";
import { FakeConfig, FakeQueue, FakeSource } from "../../contribution/tests/support/fakes";
import type { Task } from "../entities/task.interface";
import { completedEvent } from "../events/task-event.factory";
import { assignedRow, cancelledRow, roundClosedRow, shortageRow, submittedRows } from "../services/review/review-events";
import { ReviewHarness } from "./support/review-harness";
import { userOf } from "./support/service-harness";

/**
 * Hợp đồng sự kiện (README Phase 4 §4): producer p4-05 THẬT (dựng qua đường `move` → nộp chấm của harness) phải khớp schema dùng chung và được
 * consumer p4-03 (XP) + p4-06 (đóng góp) đọc đúng. Lệch tên trường ở một phía là lỗi ở đây, không phải lỗi âm thầm trên production.
 */
describe("hợp đồng sự kiện p4-05 ↔ p4-03 / p4-06", () => {
  let h: ReviewHarness;
  let task: Task;

  beforeEach(async () => {
    h = new ReviewHarness();
    const owner = h.addUser("OWNER");
    const an = h.addUser("MEMBER");
    for (let i = 0; i < 3; i++) h.addUser("MEMBER");
    const board = await h.reviewBoard(owner, { requiredReviews: 2 });
    const t = await h.addTask(owner, board, "Thẻ hợp đồng");
    h.setTask(t.id, { assigneeIds: [an.id] });
    task = (await h.tasks.findById(t.id)) as Task;
    await h.moveTo(an, board, task, "REVIEW");
  });

  const rowsOf = (type: string) => h.outbox.events.filter((e) => e.type === type);

  it("review.assigned / round-closed / cancelled / shortage: payload khớp schema Zod dùng chung (đi qua JSON như qua BullMQ) và có dedupeKey đúng khuôn", async () => {
    const round = (await h.currentRound(task.id))!;
    const reviews = await h.reviewsOf(round);
    const wire = (row: { payload: unknown }) => JSON.parse(JSON.stringify(row.payload)) as unknown;

    const assigned = assignedRow(round, reviews, "ROUND_OPENED");
    expect(reviewAssignedSchema.parse(wire(assigned))).toMatchObject({ event: DOMAIN_EVENTS.REVIEW_ASSIGNED, roundId: round.id, cause: "ROUND_OPENED" });
    expect(assigned).toMatchObject({ queue: "notifications", jobName: "review.events", dedupeKey: eventKeys.reviewAssigned(round.id) });
    expect(assignedRow(round, [reviews[0]], "REASSIGNED").dedupeKey).toBe(`review.assigned:round:${round.id}:r${reviews[0].id}`);

    const closed = roundClosedRow(round, "APPROVED", [task.assigneeIds[0]], null);
    expect(reviewRoundClosedSchema.parse(wire(closed))).toMatchObject({ status: "APPROVED", actorId: null, autoApproved: false });
    expect(closed.dedupeKey).toBe(eventKeys.reviewRoundClosed(round.id));

    const cancelledRound = cancelledRow(round, reviews, "LEFT_REVIEW");
    expect(reviewCancelledSchema.parse(wire(cancelledRound))).toMatchObject({ reason: "LEFT_REVIEW" });
    expect(cancelledRound.dedupeKey).toBe(`review.cancelled:round:${round.id}`);
    expect(cancelledRow(round, [reviews[0]], "MANUAL", "REVIEW").dedupeKey).toBe(`review.cancelled:review:${reviews[0].id}`);

    const shortage = shortageRow({ ...round, requiredReviews: 1, shortage: true });
    expect(reviewShortageSchema.parse(wire(shortage))).toMatchObject({ requiredReviews: 1, configuredReviews: 2, autoApproved: false });
    expect(shortage.dedupeKey).toBe(`review.shortage:round:${round.id}:v1`);
    // Mọi dedupeKey dùng làm jobId BullMQ: relay thế ':' → '_' nên không cần đúng số dấu ':'.
    for (const row of [assigned, closed, cancelledRound, shortage]) expect(row.dedupeKey.replace(/:/g, "_")).not.toContain(":");
  });

  it("review.submitted (producer thật): cùng payload cho HAI dòng outbox riêng; p4-03 ghi XP cho NGƯỜI CHẤM; p4-06 nhận fact một lần (idempotent)", async () => {
    const [review] = await h.reviewsOf((await h.currentRound(task.id))!);
    await h.submitService.submit(userOf(review.reviewerId), review.id, { status: "APPROVED", rubricScores: [], score10: 8.5, feedback: "Riêng tư", expectedVersion: 1 });

    const rows = rowsOf("review.submitted");
    expect(rows.map((r) => [r.queue, r.jobName, r.dedupeKey]).sort()).toEqual([
      ["gamification", "xp.consume", eventKeys.reviewSubmitted(review.id)],
      ["reports", "contribution.review-fact", eventKeys.contributionReviewFact(review.id)],
    ]);
    expect(rows[0].payload).toEqual(rows[1].payload);
    const wire = JSON.parse(JSON.stringify(rows[0].payload)) as unknown;

    const parsed = reviewSubmittedSchema.parse(wire);
    expect(parsed).toMatchObject({ event: "review.submitted", reviewId: review.id, taskId: task.id, boardId: task.boardId, workspaceId: task.workspaceId, reviewerId: review.reviewerId, assigneeIds: task.assigneeIds, status: "APPROVED", score10: 8.5 });
    expect(JSON.stringify(wire)).not.toContain("Riêng tư");

    // p4-03: XP cho người chấm, khoá idempotent theo reviewId.
    expect(mapReviewSubmitted(parsed)).toEqual([
      expect.objectContaining({ userId: review.reviewerId, sourceType: "REVIEW_SUBMITTED", sourceId: review.id, workspaceId: task.workspaceId, counters: { reviewsGiven: 1 } }),
    ]);

    // p4-06: fact lượt chấm insert-only theo reviewId.
    const facts = new InMemoryContributionFactRepository();
    const service = new ContributionFactsService({ facts, states: new InMemoryContributionStateRepository(), source: new FakeSource(), config: new FakeConfig(), queue: new FakeQueue() });
    expect(await service.onReviewSubmitted(wire as Parameters<typeof service.onReviewSubmitted>[0])).toBe("INSERTED");
    expect(facts.reviews.get(review.id)).toMatchObject({ reviewerId: review.reviewerId, boardId: task.boardId, assigneeIds: task.assigneeIds, status: "APPROVED", score10: 8.5 });
    expect(await service.onReviewSubmitted(wire as Parameters<typeof service.onReviewSubmitted>[0])).toBe("DUPLICATE");
  });

  it("Yêu cầu sửa cũng phát review.submitted (status REQUEST_CHANGES) để p4-06 tính điểm chấm; score10 luôn có", async () => {
    const [review] = await h.reviewsOf((await h.currentRound(task.id))!);
    await h.submitService.submit(userOf(review.reviewerId), review.id, { status: "REQUEST_CHANGES", rubricScores: [], score10: 4, feedback: "Sửa", expectedVersion: 1 });
    const row = rowsOf("review.submitted")[0];
    expect(reviewSubmittedSchema.parse(row.payload)).toMatchObject({ status: "REQUEST_CHANGES", score10: 4 });
    expect(submittedRows({ ...review, status: "APPROVED", score10: null, submittedAt: null }, (await h.currentRound(task.id))!, [])[0].payload).not.toHaveProperty("score10");
  });

  it("task.completed.review do ReviewDonePolicy dựng vào payload thật của TaskMoveService: { enabled, approved, roundId, autoApproved, waived }", async () => {
    const round = (await h.currentRound(task.id))!;
    for (const r of await h.reviewsOf(round)) await h.submitService.submit(userOf(r.reviewerId), r.id, { status: "APPROVED", rubricScores: [], score10: 9, expectedVersion: 1 });
    const board = await h.boards.findById(task.boardId);
    await h.moveTo(userOf(task.assigneeIds[0]), board!, task, "DONE");

    const completed = rowsOf("task.completed")[0].payload as { review: Record<string, unknown> };
    expect(completed.review).toEqual({ enabled: true, approved: true, roundId: round.id, autoApproved: false, waived: false });
    // Dạng payload đầy đủ vẫn đọc được bởi factory p3-02 (review là trường tuỳ chọn thêm, không phá hợp đồng cũ).
    const again = completedEvent({ ...(await h.tasks.findById(task.id))!, completionCount: 2 }, task.assigneeIds[0], [], { enabled: true, approved: true, roundId: round.id });
    expect(again.payload.review).toMatchObject({ enabled: true, approved: true, roundId: round.id });
  });
});
