import { newObjectId } from "../../../core/utils/object-id";
import type { Board, BoardColumn } from "../entities/board.interface";
import type { RoundCreateInput } from "../entities/task-review.interface";
import type { Task } from "../entities/task.interface";
import { InMemoryReviewStore, InMemoryTaskReviewRoundRepository } from "../repositories/task-review.repository.inmemory";
import { defaultBoardReview } from "../services/review/review-config.schema";
import { ReviewDonePolicy } from "../services/review/review-done.policy";
import type { TaskMovePolicyContext } from "../services/task-move-policy";

const oid = (n: number): string => n.toString(16).padStart(24, "0");
const NOW = new Date("2026-09-25T10:00:00Z");
const DONE: BoardColumn = { id: "c_done0001", title: "Done", kind: "DONE", order: 3, wipLimit: null };
const TODO: BoardColumn = { id: "c_todo0001", title: "To do", kind: "TODO", order: 0, wipLimit: null };

const board = (review: unknown): Board => ({
  id: oid(2),
  workspaceId: oid(3),
  name: "B",
  normalizedName: "b",
  description: null,
  columns: [TODO, DONE],
  review,
  createdBy: oid(9),
  archivedAt: null,
  version: 1,
  createdAt: NOW,
  updatedAt: NOW,
});

const task = (over: Partial<Task> = {}): Task =>
  ({ id: oid(1), boardId: oid(2), workspaceId: oid(3), columnId: TODO.id, columnKind: "TODO", assigneeIds: [], reviewState: "NONE", ...over }) as Task;

const ctx = (b: Board, t: Task): TaskMovePolicyContext => ({
  board: b,
  task: t,
  fromColumn: TODO,
  toColumn: DONE,
  actorId: oid(9),
  now: NOW,
  tx: { __projectsTx: true },
});

const roundInput = (over: Partial<RoundCreateInput> = {}): RoundCreateInput => ({
  id: newObjectId(),
  taskId: oid(1),
  boardId: oid(2),
  workspaceId: oid(3),
  round: 1,
  status: "OPEN",
  requiredReviews: 2,
  configuredReviews: 2,
  assignedCount: 2,
  approvedCount: 1,
  rubricSnapshot: [],
  shortage: false,
  autoApproved: false,
  openedBy: null,
  openedAt: NOW,
  closedAt: null,
  closeReason: null,
  ...over,
});

const setup = () => {
  const rounds = new InMemoryTaskReviewRoundRepository(new InMemoryReviewStore());
  return { rounds, policy: new ReviewDonePolicy({ rounds }) };
};

describe("ReviewDonePolicy — chặn vào DONE khi chưa đủ duyệt (PM2-06)", () => {
  it("bảng chưa bật chấm chéo → cho qua, metadata { enabled: false, approved: false }", async () => {
    const { policy } = setup();
    expect(await policy.check(ctx(board(null), task()))).toEqual({ review: { enabled: false, approved: false } });
    expect(await policy.check(ctx(board({ ...defaultBoardReview(2, false) }), task()))).toEqual({ review: { enabled: false, approved: false } });
  });

  it("thẻ ở TODO chưa từng vào REVIEW (không có lượt) → 409 TASK_002 REVIEW_REQUIRED (nhảy thẳng TODO → DONE)", async () => {
    const { policy } = setup();
    await expect(policy.check(ctx(board(defaultBoardReview(2, true)), task()))).rejects.toMatchObject({
      statusCode: 409,
      errorCode: "TASK_002",
      details: { reason: "REVIEW_REQUIRED", approvedCount: 0, requiredReviews: 2, roundStatus: "NONE" },
    });
  });

  it("lượt OPEN 1/2 → 409 kèm approvedCount/requiredReviews/roundStatus của lượt", async () => {
    const { policy, rounds } = setup();
    await rounds.create(roundInput());
    await expect(policy.check(ctx(board(defaultBoardReview(2, true)), task({ reviewState: "PENDING" })))).rejects.toMatchObject({
      errorCode: "TASK_002",
      details: { reason: "REVIEW_REQUIRED", approvedCount: 1, requiredReviews: 2, roundStatus: "OPEN" },
    });
  });

  it("lượt CHANGES_REQUESTED / CANCELLED → vẫn chặn, roundStatus phản ánh trạng thái", async () => {
    const { policy, rounds } = setup();
    const r = await rounds.create(roundInput());
    await rounds.updateCas(r.id, 1, { status: "CHANGES_REQUESTED", closedAt: NOW, closeReason: "CHANGES_REQUESTED" });
    await expect(policy.check(ctx(board(defaultBoardReview(3, true)), task({ reviewState: "CHANGES_REQUESTED" })))).rejects.toMatchObject({
      details: { reason: "REVIEW_REQUIRED", approvedCount: 0, requiredReviews: 3, roundStatus: "CHANGES_REQUESTED" },
    });
  });

  it("lượt APPROVED + reviewState APPROVED → cho qua, metadata review { enabled, approved, roundId, autoApproved, waived }", async () => {
    const { policy, rounds } = setup();
    const r = await rounds.create(roundInput({ status: "APPROVED", approvedCount: 2, closedAt: NOW, closeReason: "APPROVED" }));
    expect(await policy.check(ctx(board(defaultBoardReview(2, true)), task({ reviewState: "APPROVED" })))).toEqual({
      review: { enabled: true, approved: true, roundId: r.id, autoApproved: false, waived: false },
    });
  });

  it("lượt WAIVED và lượt tự duyệt (autoApproved) → cho qua kèm cờ waived/autoApproved", async () => {
    const waived = setup();
    const w = await waived.rounds.create(roundInput({ status: "APPROVED", closedAt: NOW, closeReason: "APPROVED" }));
    await waived.rounds.updateCas(w.id, 1, { status: "WAIVED", closeReason: "WAIVED", waivedBy: oid(9), waiveReason: "Thẻ khẩn cấp cần giao ngay" });
    expect((await waived.policy.check(ctx(board(defaultBoardReview(2, true)), task({ reviewState: "APPROVED" })))).review).toMatchObject({ approved: true, waived: true, autoApproved: false });

    const auto = setup();
    await auto.rounds.create(roundInput({ status: "APPROVED", requiredReviews: 0, assignedCount: 0, approvedCount: 0, shortage: true, autoApproved: true, closedAt: NOW, closeReason: "APPROVED" }));
    expect((await auto.policy.check(ctx(board(defaultBoardReview(2, true)), task({ reviewState: "APPROVED" })))).review).toMatchObject({ approved: true, autoApproved: true, waived: false });
  });

  it("duyệt đã hết hiệu lực (reviewState về NONE sau ân hạn mở lại) → chặn dù lượt cũ APPROVED", async () => {
    const { policy, rounds } = setup();
    await rounds.create(roundInput({ status: "APPROVED", approvedCount: 2, closedAt: NOW, closeReason: "APPROVED" }));
    await expect(policy.check(ctx(board(defaultBoardReview(2, true)), task({ reviewState: "NONE" })))).rejects.toMatchObject({ errorCode: "TASK_002", details: { reason: "REVIEW_REQUIRED" } });
  });
});
