import type { AuthUser } from "../../../core/types/express";
import { eventKeys } from "../../../shared/events/domain-events";
import type { Board } from "../entities/board.interface";
import type { TaskReview } from "../entities/task-review.interface";
import type { Task } from "../entities/task.interface";
import { REVIEW_NOTIFICATION_TYPES as T } from "../services/review/review-notification.types";
import { parseReviewEvent, type ReviewEventPayload } from "../services/review/review-events";
import { ReviewHarness } from "./support/review-harness";
import { userOf } from "./support/service-harness";

describe("ReviewNotificationHandler — outbox review.* → thông báo, hẹn nhắc, realtime", () => {
  let h: ReviewHarness;
  let owner: AuthUser;
  let an: AuthUser;
  let board: Board;
  let task: Task;
  let reviews: TaskReview[];

  /** Hàng outbox đã ghi → payload như consumer nhận (đi qua JSON như qua BullMQ). */
  const fromOutbox = (type: string): ReviewEventPayload => {
    const row = h.outbox.events.find((e) => e.type === type)!;
    return parseReviewEvent(JSON.parse(JSON.stringify(row.payload)))!;
  };
  const jobId = (type: string): string => h.outbox.events.find((e) => e.type === type)!.dedupeKey.replace(/:/g, "_");

  beforeEach(async () => {
    h = new ReviewHarness();
    owner = h.addUser("OWNER");
    an = h.addUser("MEMBER");
    for (let i = 0; i < 3; i++) h.addUser("MEMBER");
    board = await h.reviewBoard(owner, { requiredReviews: 2 });
    const t = await h.addTask(owner, board, "Thẻ thông báo");
    h.setTask(t.id, { assigneeIds: [an.id] });
    task = (await h.tasks.findById(t.id)) as Task;
    await h.moveTo(an, board, task, "REVIEW");
    reviews = await h.reviewsOf((await h.currentRound(task.id))!);
  });

  it("review.assigned: REVIEW_REQUESTED tới từng người chấm (không lộ điểm/nhận xét), hẹn nhắc 24 giờ và 72 giờ sau lúc được giao, phát realtime", async () => {
    h.emitter.events.length = 0;
    await h.notificationHandler.handle(fromOutbox("review.assigned"), jobId("review.assigned"));

    expect(h.notifications).toHaveLength(1);
    const n = h.notifications[0];
    expect(n).toMatchObject({
      type: T.REQUESTED,
      scope: { type: "WORKSPACE", id: h.workspaceId },
      workspaceId: h.workspaceId,
      dedupeKey: `notif.${jobId("review.assigned")}`,
      refs: { taskId: task.id, boardId: board.id, workspaceId: h.workspaceId, roundId: reviews[0].roundId, taskTitle: "Thẻ thông báo" },
    });
    expect(n.recipients.map((r) => r.userId).sort()).toEqual(reviews.map((r) => r.reviewerId).sort());
    expect(JSON.stringify(n)).not.toMatch(/score|feedback/);

    expect(h.reminders.scheduled).toHaveLength(4); // 2 người × 2 mốc
    for (const review of reviews) {
      const own = h.reminders.scheduled.filter((s) => s.reviewId === review.id);
      expect(own.map((s) => s.hours).sort()).toEqual([24, 72]);
      for (const s of own) expect(s.runAt.getTime()).toBe(review.assignedAt.getTime() + s.hours * 3_600_000);
    }
    expect(h.emitter.of("task:review-updated")).toHaveLength(1);
  });

  it("mốc nhắc lấy từ SystemConfig pm.review.reminderHours; mốc đã quá hạn (đã trễ 25 giờ) không được hẹn", async () => {
    h.defaults = { ...h.defaults, reminderHours: [1, 48] };
    h.travel(25 * 3_600_000); // mốc 1 giờ đã qua, mốc 48 giờ còn tới
    await h.notificationHandler.handle(fromOutbox("review.assigned"), jobId("review.assigned"));
    expect(h.reminders.scheduled.map((x) => x.hours)).toEqual([48, 48]); // hai người chấm × mốc 48 giờ
  });

  it("người đã nộp hoặc đã rời nhóm không nhận REVIEW_REQUESTED và không được hẹn nhắc", async () => {
    await h.reviewRepo.updatePendingCas(reviews[0].id, 1, { status: "APPROVED", submittedAt: new Date(), score10: 7 });
    h.directory.members.delete(reviews[1].reviewerId);
    await h.notificationHandler.handle(fromOutbox("review.assigned"), jobId("review.assigned"));
    expect(h.notifications).toHaveLength(0);
    expect(h.reminders.scheduled).toHaveLength(0);
  });

  it("review.round-closed: CHANGES_REQUESTED / APPROVED / WAIVED → đúng loại thông báo tới người làm (không tới người hành động)", async () => {
    // Yêu cầu sửa
    await h.submitService.submit(userOf(reviews[0].reviewerId), reviews[0].id, { status: "REQUEST_CHANGES", rubricScores: [], score10: 3, feedback: "Sửa lại", expectedVersion: 1 });
    await h.notificationHandler.handle(fromOutbox("review.round-closed"), jobId("review.round-closed"));
    expect(h.notifications.at(-1)).toMatchObject({ type: T.CHANGES_REQUESTED, recipients: [{ userId: an.id }], refs: { autoApproved: false } });

    // Miễn chấm ở lượt 2
    h.outbox.events.length = 0;
    await h.moveTo(an, board, task, "REVIEW");
    await h.waiveService.waive(owner, task.id, { reason: "Chủ nhóm miễn chấm cho thẻ này" });
    await h.notificationHandler.handle(fromOutbox("review.round-closed"), jobId("review.round-closed"));
    expect(h.notifications.at(-1)).toMatchObject({ type: T.WAIVED, recipients: [{ userId: an.id }] });
  });

  it("đủ duyệt → REVIEW_APPROVED cho người làm; người làm đã rời nhóm thì không nhận", async () => {
    for (const r of reviews) await h.submitService.submit(userOf(r.reviewerId), r.id, { status: "APPROVED", rubricScores: [], score10: 9, expectedVersion: 1 });
    const payload = fromOutbox("review.round-closed");
    h.directory.members.delete(an.id);
    await h.notificationHandler.handle(payload, jobId("review.round-closed"));
    expect(h.notifications).toHaveLength(0);
    h.directory.members.add(an.id);
    await h.notificationHandler.handle(payload, jobId("review.round-closed"));
    expect(h.notifications.at(-1)).toMatchObject({ type: T.APPROVED, recipients: [{ userId: an.id }] });
  });

  it("review.cancelled → REVIEW_CANCELLED cho người chấm bị huỷ; review.shortage → REVIEW_SHORTAGE cho OWNER/ADMIN", async () => {
    await h.moveTo(an, board, task, "IN_PROGRESS");
    await h.notificationHandler.handle(fromOutbox("review.cancelled"), jobId("review.cancelled"));
    const cancelled = h.notifications.at(-1)!;
    expect(cancelled.type).toBe(T.CANCELLED);
    expect(cancelled.recipients.map((r) => r.userId).sort()).toEqual(reviews.map((r) => r.reviewerId).sort());

    const small = new ReviewHarness();
    const o = small.addUser("OWNER");
    const a = small.addUser("MEMBER");
    const bd = await small.reviewBoard(o, { requiredReviews: 2 });
    const t = await small.addTask(o, bd, "Thiếu người");
    small.setTask(t.id, { assigneeIds: [a.id] });
    await small.moveTo(a, bd, t, "REVIEW");
    const row = small.outbox.events.find((e) => e.type === "review.shortage")!;
    await small.notificationHandler.handle(parseReviewEvent(JSON.parse(JSON.stringify(row.payload)))!, row.dedupeKey.replace(/:/g, "_"));
    expect(small.notifications.at(-1)).toMatchObject({ type: T.SHORTAGE, recipients: [{ userId: o.id }], refs: { requiredReviews: 1, configuredReviews: 2, autoApproved: false } });
  });

  it("thẻ đã xoá → không thông báo, không phát realtime", async () => {
    h.setTask(task.id, { deletedAt: new Date() });
    h.emitter.events.length = 0;
    await h.notificationHandler.handle(fromOutbox("review.assigned"), jobId("review.assigned"));
    expect(h.notifications).toHaveLength(0);
    expect(h.emitter.events).toHaveLength(0);
  });

  it("remind: gửi REVIEW_REMINDER khi review vẫn PENDING trong lượt mở (dedupe theo review + mốc); bỏ qua nếu đã nộp/lượt đóng/thành người làm/đã rời", async () => {
    const [a, b] = reviews;
    expect(await h.notificationHandler.remind({ reviewId: a.id, hours: 24 })).toBe("sent");
    expect(h.notifications.at(-1)).toMatchObject({ type: T.REMINDER, recipients: [{ userId: a.reviewerId }], dedupeKey: eventKeys.reviewReminder(a.id, 24) });

    await h.submitService.submit(userOf(a.reviewerId), a.id, { status: "APPROVED", rubricScores: [], score10: 9, expectedVersion: 1 });
    expect(await h.notificationHandler.remind({ reviewId: a.id, hours: 72 })).toBe("skipped"); // đã nộp

    h.setTask(task.id, { assigneeIds: [an.id, b.reviewerId] });
    expect(await h.notificationHandler.remind({ reviewId: b.id, hours: 24 })).toBe("skipped"); // thành người làm
    h.setTask(task.id, { assigneeIds: [an.id] });
    h.directory.members.delete(b.reviewerId);
    expect(await h.notificationHandler.remind({ reviewId: b.id, hours: 24 })).toBe("skipped"); // đã rời nhóm
    h.directory.members.add(b.reviewerId);
    await h.submitService.submit(userOf(b.reviewerId), b.id, { status: "REQUEST_CHANGES", rubricScores: [], score10: 2, feedback: "Sửa", expectedVersion: 1 });
    expect(await h.notificationHandler.remind({ reviewId: b.id, hours: 72 })).toBe("skipped"); // lượt đã đóng
    expect(await h.notificationHandler.remind({ reviewId: "0".repeat(24), hours: 24 })).toBe("skipped");
  });

  it("parseReviewEvent: payload sai dạng/sự kiện lạ → null (processor bỏ qua có log)", () => {
    expect(parseReviewEvent(null)).toBeNull();
    expect(parseReviewEvent({ event: "review.assigned", roundId: "x" })).toBeNull();
    expect(parseReviewEvent({ event: "khac" })).toBeNull();
  });
});
