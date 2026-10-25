import { InMemoryContributionFactRepository } from "../repositories/contribution-fact.repository.inmemory";
import { InMemoryContributionStateRepository } from "../repositories/contribution-state.repository.inmemory";
import { ContributionFactsService } from "../services/contribution-facts.service";
import { calculateContribution } from "../services/contribution-calculator";
import { DEFAULT_CONTRIBUTION_CONFIG } from "../../../core/constants/contribution";
import { FakeConfig, FakeQueue, FakeSource, oid } from "./support/fakes";

const BOARD = oid(1);
const WS = oid(2);
const TASK = oid(3);
const AN = oid(10);
const BINH = oid(11);

function setup(now = new Date("2026-09-15T03:00:00Z")) {
  const facts = new InMemoryContributionFactRepository();
  const states = new InMemoryContributionStateRepository();
  const source = new FakeSource();
  const queue = new FakeQueue();
  const service = new ContributionFactsService({ facts, states, source, config: new FakeConfig(), queue, now: () => now });
  return { facts, states, source, queue, service };
}

type Completed = Parameters<ContributionFactsService["onTaskCompleted"]>[0];
type Reopened = Parameters<ContributionFactsService["onTaskReopened"]>[0];

const completed = (n: number, over: Partial<Completed> = {}): Completed =>
  ({
    event: "task.completed",
    taskId: TASK,
    boardId: BOARD,
    workspaceId: WS,
    actorId: AN,
    assigneeIds: [AN],
    storyPoints: 5,
    dueDate: "2026-09-20T10:00:00.000Z",
    completedAt: `2026-09-1${n}T08:00:00.000Z`,
    onTime: true,
    completionCount: n,
    taskCreatedAt: "2026-09-01T00:00:00.000Z",
    labelNames: [],
    review: { enabled: false, approved: false },
    ...over,
  }) as Completed;

const reopened = (n: number): Reopened =>
  ({ event: "task.reopened", taskId: TASK, boardId: BOARD, workspaceId: WS, actorId: AN, assigneeIds: [AN], completionCount: n, reopenedAt: `2026-09-1${n}T09:00:00.000Z` }) as Reopened;

const pointsOf = (facts: InMemoryContributionFactRepository): number => {
  const tasks = [...facts.tasks.values()].filter((t) => t.active);
  return calculateContribution({ tasks, reviews: [], config: DEFAULT_CONTRIBUTION_CONFIG, memberIds: [AN], timezone: "Asia/Ho_Chi_Minh" }).members[0].storyPointsDone;
};

describe("ContributionFactsService — PM2-09 (idempotent theo thẻ + completionCount)", () => {
  it("cùng task.completed chạy 3 lần → MỘT fact, điểm không nhân đôi, phiên bản tăng đúng một lần", async () => {
    const { facts, states, service } = setup();
    for (let i = 0; i < 3; i += 1) await service.onTaskCompleted(completed(1));
    expect(facts.tasks.size).toBe(1);
    expect(pointsOf(facts)).toBe(5);
    expect((await states.get(BOARD))?.factsVersion).toBe(1);
  });

  it("chạy song song ba lần (mô phỏng consumer XP p4-03 cùng lúc) vẫn một fact", async () => {
    const { facts, service } = setup();
    await Promise.all([service.onTaskCompleted(completed(1)), service.onTaskCompleted(completed(1)), service.onTaskCompleted(completed(1))]);
    expect(facts.tasks.size).toBe(1);
    expect(pointsOf(facts)).toBe(5);
  });

  it("completed c1 → reopened c1 → completed c2: một fact, completedAt MỚI, điểm tính một lần", async () => {
    const { facts, service } = setup();
    await service.onTaskCompleted(completed(1));
    await service.onTaskReopened(reopened(1));
    expect(pointsOf(facts)).toBe(0);
    await service.onTaskCompleted(completed(2, { storyPoints: 8 }));
    expect(facts.tasks.size).toBe(1);
    const fact = facts.tasks.get(TASK);
    expect(fact).toMatchObject({ active: true, completionCount: 2, storyPoints: 8 });
    expect(fact?.completedAt.toISOString()).toBe("2026-09-12T08:00:00.000Z");
    expect(pointsOf(facts)).toBe(8);
  });

  it("sự kiện cũ tới muộn (completed c1 sau khi đã c2) bị bỏ", async () => {
    const { facts, states, service } = setup();
    await service.onTaskCompleted(completed(2));
    const version = (await states.get(BOARD))?.factsVersion;
    await service.onTaskCompleted(completed(1));
    expect(facts.tasks.get(TASK)?.completionCount).toBe(2);
    expect((await states.get(BOARD))?.factsVersion).toBe(version);
  });

  it("reopened c1 tới TRƯỚC completed c1 → bản giữ chỗ; completed c1 tới sau bị bỏ, completed c2 áp", async () => {
    const { facts, service } = setup();
    await service.onTaskReopened(reopened(1));
    expect(facts.tasks.get(TASK)).toMatchObject({ active: false, completionCount: 1 });
    await service.onTaskCompleted(completed(1));
    expect(facts.tasks.get(TASK)?.active).toBe(false);
    expect(pointsOf(facts)).toBe(0);
    await service.onTaskCompleted(completed(2));
    expect(facts.tasks.get(TASK)).toMatchObject({ active: true, completionCount: 2 });
  });

  it("reopened c2 tới trước completed c2 khi đang giữ fact c1 → nâng lên c2 (đã mở lại), completed c2 muộn bị bỏ", async () => {
    const { facts, service } = setup();
    await service.onTaskCompleted(completed(1));
    await service.onTaskReopened(reopened(1));
    await service.onTaskReopened(reopened(2));
    expect(facts.tasks.get(TASK)).toMatchObject({ active: false, completionCount: 2 });
    await service.onTaskCompleted(completed(2));
    expect(facts.tasks.get(TASK)?.active).toBe(false);
  });

  it("reopened lặp (retry) không đổi gì thêm", async () => {
    const { states, service } = setup();
    await service.onTaskCompleted(completed(1));
    await service.onTaskReopened(reopened(1));
    const version = (await states.get(BOARD))?.factsVersion;
    await service.onTaskReopened(reopened(1));
    expect((await states.get(BOARD))?.factsVersion).toBe(version);
  });

  it("thẻ nhiều người làm lưu đủ danh sách người làm TẠI LÚC hoàn thành", async () => {
    const { facts, service } = setup();
    await service.onTaskCompleted(completed(1, { assigneeIds: [AN, BINH] }));
    expect(facts.tasks.get(TASK)?.assigneeIds).toEqual([AN, BINH]);
  });
});

describe("ContributionFactsService — tính lại có debounce", () => {
  it("fact đổi → xếp job tính lại trễ 60 s, cùng cửa sổ thì cùng jobId (BullMQ bỏ trùng)", async () => {
    const { queue, service } = setup();
    await service.onTaskCompleted(completed(1));
    await service.onTaskCompleted(completed(1, { taskId: oid(4) }));
    expect(queue.jobs).toHaveLength(2);
    expect(queue.jobs[0].delayMs).toBe(60_000);
    expect(queue.jobs[0].jobId).toBe(queue.jobs[1].jobId);
    expect(queue.jobs[0].jobId).toMatch(new RegExp(`^contribution\\.recompute:board:${BOARD}:t\\d+$`));
  });

  it("bảng đã tính xong (computedVersion = factsVersion) thì không xếp thêm job", async () => {
    const { states, queue, service } = setup();
    await service.onTaskCompleted(completed(1));
    await states.markComputed(BOARD, 1, new Date(), "Asia/Ho_Chi_Minh");
    queue.jobs = [];
    await service.onTaskCompleted(completed(1));
    expect(queue.jobs).toHaveLength(0);
  });

  it("retry sau khi fact đã ghi nhưng chưa có state (lần trước chết giữa chừng) vẫn tăng phiên bản và xếp job", async () => {
    const { facts, states, queue, service } = setup();
    await facts.applyCompleted({ taskId: TASK, boardId: BOARD, workspaceId: WS, assigneeIds: [AN], storyPoints: 5, dueDate: null, completedAt: new Date(), completionCount: 1, reviewApproved: null });
    await service.onTaskCompleted(completed(1));
    expect((await states.get(BOARD))?.factsVersion).toBe(1);
    expect(queue.jobs).toHaveLength(1);
  });
});

describe("ContributionFactsService — review.submitted", () => {
  const review = { reviewId: oid(20), taskId: TASK, boardId: BOARD, workspaceId: WS, reviewerId: BINH, assigneeIds: [AN], status: "APPROVED", score10: 8.5, submittedAt: "2026-09-15T02:00:00.000Z" };

  it("insert-only theo reviewId: gửi lại không nhân đôi, phiên bản chỉ tăng lần đầu", async () => {
    const { facts, states, service } = setup();
    expect(await service.onReviewSubmitted(review)).toBe("INSERTED");
    expect(await service.onReviewSubmitted(review)).toBe("DUPLICATE");
    expect(facts.reviews.size).toBe(1);
    expect((await states.get(BOARD))?.factsVersion).toBe(1);
    expect(facts.reviews.get(review.reviewId)).toMatchObject({ reviewerId: BINH, assigneeIds: [AN], score10: 8.5, status: "APPROVED" });
  });

  it("payload chỉ có reviewId → đọc phần còn lại từ TaskReview (nguồn sự thật) + người làm hiện tại", async () => {
    const { facts, source, service } = setup();
    source.reviews.push({
      id: review.reviewId,
      taskId: TASK,
      boardId: BOARD,
      workspaceId: WS,
      reviewerId: BINH,
      status: "REQUEST_CHANGES",
      score10: 5,
      submittedAt: new Date(review.submittedAt),
    });
    source.assignees.set(TASK, [AN]);
    expect(await service.onReviewSubmitted({ reviewId: review.reviewId })).toBe("INSERTED");
    expect(facts.reviews.get(review.reviewId)).toMatchObject({ status: "REQUEST_CHANGES", score10: 5, assigneeIds: [AN], boardId: BOARD });
  });

  it("lượt chưa nộp/không đủ dữ liệu → bỏ qua, không ghi fact", async () => {
    const { facts, service } = setup();
    expect(await service.onReviewSubmitted({ reviewId: oid(99) })).toBe("IGNORED");
    expect(await service.onReviewSubmitted({ ...review, status: "PENDING" })).toBe("IGNORED");
    expect(facts.reviews.size).toBe(0);
  });

  it("lượt không có điểm được lưu với score10 null", async () => {
    const { facts, service } = setup();
    await service.onReviewSubmitted({ ...review, score10: undefined });
    expect(facts.reviews.get(review.reviewId)?.score10).toBeNull();
  });
});

describe("ContributionFactsService — hoạt động khác của thẻ", () => {
  const created = { event: "task.created", taskId: TASK, boardId: BOARD, workspaceId: WS, actorId: AN, columnId: "c_x", createdBy: AN, assigneeIds: [], dueDate: null, createdAt: new Date().toISOString() } as never;

  it("có người gây ra → đánh dấu bảng bẩn cho heatmap", async () => {
    const { states, service } = setup(new Date("2026-09-15T03:00:00Z"));
    await service.onTaskActivity(created);
    expect((await states.get(BOARD))?.activityDirtyAt?.toISOString()).toBe("2026-09-15T03:00:00.000Z");
  });

  it("actorId null (hệ thống) → không đánh dấu", async () => {
    const { states, service } = setup();
    await service.onTaskActivity({ ...(created as object), actorId: null } as never);
    expect(await states.get(BOARD)).toBeNull();
  });
});
