import { installMocks, redisStore } from "./projects-test-mocks";
import { buildProjectsApp, cleanupGroups, ensureProjectIndexes, makeApi, mutationId, seedGroup, tokenFor, type Group } from "./projects-test-kit";
import { prisma } from "../../../../infrastructure/database";
import { getProjectsContainer } from "../../projects.container";

// Không có Redis/BullMQ thật: huỷ/hẹn job nhắc là no-op.
jest.mock("../../../../infrastructure/queue", () => ({
  ...jest.requireActual("../../../../infrastructure/queue"),
  cancelJob: jest.fn(),
  scheduleAt: jest.fn(),
}));

const app = buildProjectsApp();
const api = makeApi(app);

type Board = { id: string; version: number; columns: { id: string; kind: string }[] };

/**
 * PM2-30 trên Mongo THẬT: người chấm rời nhóm (`membership.revoked` → `reassignForUsers`), bị ẩn danh hoá (quét bù), thành người làm (`task.assigned`).
 * Kiểm cả idempotency + đua nhau (hai lượt xử lý cùng lúc) — chỉ MỘT người thay thế nhờ `BoardWriteRunner` + CAS trạng thái review.
 */
describe("p4-05 giao lại tự động — consumer trên Mongo memory replset (PM2-30)", () => {
  const groups: Group[] = [];
  let g: Group;
  let board: Board;
  const reconcile = () => getProjectsContainer().review.reconcile;

  beforeAll(async () => {
    await ensureProjectIndexes();
    await prisma.$runCommandRaw({ createIndexes: "OutboxEvent", indexes: [{ key: { dedupeKey: 1 }, name: "OutboxEvent_dedupeKey_key", unique: true }] });
  });
  afterEach(async () => {
    await cleanupGroups(groups.splice(0));
    redisStore.clear();
  });

  const as = (who: string) => tokenFor(g.ids[who]);
  const col = (kind: string) => board.columns.find((c) => c.kind === kind)!.id;
  const nameOf = (userId: string): string => Object.entries(g.ids).find(([, id]) => id === userId)![0];

  /** Nhóm `members` (tên → vai trò); thẻ của người làm `assignee` đã vào REVIEW với `required` lượt duyệt. */
  async function setup(members: Record<string, "OWNER" | "MEMBER">, required: number, assignee = "B") {
    installMocks();
    g = await seedGroup(members);
    groups.push(g);
    board = (await api("post", `/workspaces/${g.workspaceId}/boards`, as("A"), { name: "Đồ án" })).body.data;
    const cfg = await api("put", `/boards/${board.id}/review-config`, as("A"), { enabled: true, requiredReviews: required, rubric: [], autoCompleteOnApproval: false, expectedVersion: 1 });
    expect(cfg.status).toBe(200);
    const created = (await api("post", `/boards/${board.id}/tasks`, as("A"), { title: "Thẻ giao lại", assigneeIds: [g.ids[assignee]] })).body.data;
    const moved = await api("post", `/tasks/${created.id}/move`, as(assignee), { columnId: col("REVIEW"), afterTaskId: null, beforeTaskId: null, expectedVersion: 1, clientMutationId: mutationId() });
    expect(moved.status).toBe(200);
    return { taskId: created.id as string };
  }
  const reviews = (taskId: string) => prisma.taskReview.findMany({ where: { taskId }, orderBy: { assignedAt: "asc" } });
  const leave = (userId: string) => prisma.workspaceMembership.updateMany({ where: { workspaceId: g.workspaceId, userId }, data: { status: "REMOVED" } });

  it("người chấm rời nhóm (chạy HAI lần cùng lúc): đúng MỘT người thay thế, review cũ REASSIGNED (MEMBER_LEFT), không đổi số lượt cần; outbox review.assigned (REASSIGNED)", async () => {
    const { taskId } = await setup({ A: "OWNER", B: "MEMBER", C: "MEMBER", D: "MEMBER", E: "MEMBER", F: "MEMBER" }, 2);
    const before = await reviews(taskId);
    expect(before).toHaveLength(2);
    const leaver = before[0];
    await leave(leaver.reviewerId);

    const [x, y] = await Promise.all([reconcile().reassignForUsers(g.workspaceId, [leaver.reviewerId]), reconcile().reassignForUsers(g.workspaceId, [leaver.reviewerId])]);
    expect(x + y).toBe(1);

    const after = await reviews(taskId);
    expect(after).toHaveLength(3);
    expect(after.find((r) => r.id === leaver.id)).toMatchObject({ status: "REASSIGNED", cancelReason: "MEMBER_LEFT" });
    const replacement = after.find((r) => r.id === after.find((a) => a.id === leaver.id)!.replacedById)!;
    expect(replacement).toMatchObject({ status: "PENDING", assignedBy: null });
    expect([nameOf(replacement.reviewerId)]).not.toContain("B"); // không phải người làm
    expect(after.filter((r) => r.status === "PENDING")).toHaveLength(2);
    const round = (await prisma.taskReviewRound.findFirst({ where: { taskId } }))!;
    expect(round).toMatchObject({ status: "OPEN", requiredReviews: 2, shortage: false });
    expect(await prisma.outboxEvent.count({ where: { type: "review.assigned", aggregateId: round.id } })).toBe(2); // mở lượt + giao lại
    expect(await reconcile().reassignForUsers(g.workspaceId, [leaver.reviewerId])).toBe(0);
  });

  it("thiếu người: không còn ứng viên → requiredReviews giảm, shortage, outbox review.shortage; đủ số đã duyệt → lượt đóng APPROVED", async () => {
    const { taskId } = await setup({ A: "OWNER", B: "MEMBER", C: "MEMBER" }, 2); // ứng viên: A và C; người làm B
    const [first, second] = await reviews(taskId);
    // Người thứ nhất duyệt xong.
    await prisma.taskReview.update({ where: { id: first.id }, data: { status: "APPROVED", submittedAt: new Date(), score10: 9 } });
    await prisma.taskReviewRound.updateMany({ where: { taskId }, data: { approvedCount: 1 } });
    await leave(second.reviewerId);

    expect(await reconcile().reassignForUsers(g.workspaceId, [second.reviewerId])).toBe(1);

    expect(await prisma.taskReview.findUnique({ where: { id: second.id } })).toMatchObject({ status: "CANCELLED", cancelReason: "MEMBER_LEFT" });
    const round = (await prisma.taskReviewRound.findFirst({ where: { taskId } }))!;
    expect(round).toMatchObject({ status: "APPROVED", requiredReviews: 1, approvedCount: 1, shortage: true, autoApproved: false, closeReason: "APPROVED", activeKey: `round:${round.id}` });
    expect((await prisma.task.findUnique({ where: { id: taskId } }))!.reviewState).toBe("APPROVED");
    expect(await prisma.outboxEvent.count({ where: { aggregateId: round.id, type: { in: ["review.shortage", "review.round-closed"] } } })).toBe(2);
  });

  it("không còn ai chấm được (chưa ai duyệt) → tự duyệt autoApproved; thẻ sang DONE được", async () => {
    const { taskId } = await setup({ A: "OWNER", B: "MEMBER" }, 2); // ứng viên duy nhất: A
    const [only] = await reviews(taskId);
    expect(only.reviewerId).toBe(g.ids.A);
    await leave(g.ids.A);

    expect(await reconcile().reassignForUsers(g.workspaceId, [g.ids.A])).toBe(1);

    const round = (await prisma.taskReviewRound.findFirst({ where: { taskId } }))!;
    expect(round).toMatchObject({ status: "APPROVED", requiredReviews: 0, autoApproved: true, shortage: true });
    const done = await api("post", `/tasks/${taskId}/move`, as("B"), { columnId: col("DONE"), afterTaskId: null, beforeTaskId: null, expectedVersion: (await prisma.task.findUnique({ where: { id: taskId } }))!.version, clientMutationId: mutationId() });
    expect(done.status).toBe(200);
  });

  it("task.assigned: người chấm được thêm vào người làm → giao lại (BECAME_ASSIGNEE), người đã nộp giữ nguyên; chạy lặp không đổi gì", async () => {
    const { taskId } = await setup({ A: "OWNER", B: "MEMBER", C: "MEMBER", D: "MEMBER", E: "MEMBER" }, 2);
    const [a, b] = await reviews(taskId);
    await prisma.taskReview.update({ where: { id: b.id }, data: { status: "APPROVED", submittedAt: new Date(), score10: 8 } });
    await prisma.task.update({ where: { id: taskId }, data: { assigneeIds: [g.ids.B, a.reviewerId, b.reviewerId] } });

    expect(await reconcile().onTaskAssigned(taskId)).toBe(1);
    expect(await prisma.taskReview.findUnique({ where: { id: a.id } })).toMatchObject({ status: "REASSIGNED", cancelReason: "BECAME_ASSIGNEE" });
    expect(await prisma.taskReview.findUnique({ where: { id: b.id } })).toMatchObject({ status: "APPROVED" });
    expect(await reconcile().onTaskAssigned(taskId)).toBe(0);
  });

  it("quét bù (cron review.reconcile): người chấm bị ẩn danh hoá (User.status ANONYMIZED) được giao lại; thẻ bị xoá → lượt đóng TASK_DELETED", async () => {
    const { taskId } = await setup({ A: "OWNER", B: "MEMBER", C: "MEMBER", D: "MEMBER", E: "MEMBER" }, 2);
    const [a] = await reviews(taskId);
    await prisma.user.update({ where: { id: a.reviewerId }, data: { status: "ANONYMIZED" } });

    const result = await reconcile().sweep();
    expect(result.replaced).toBeGreaterThanOrEqual(1);
    expect(await prisma.taskReview.findUnique({ where: { id: a.id } })).toMatchObject({ status: "REASSIGNED", cancelReason: "MEMBER_LEFT" });
    const active = (await reviews(taskId)).filter((r) => r.status === "PENDING");
    expect(active).toHaveLength(2);
    expect(active.map((r) => r.reviewerId)).not.toContain(a.reviewerId);

    await prisma.task.update({ where: { id: taskId }, data: { deletedAt: new Date(), deletedBy: g.ids.A } });
    await reconcile().sweep();
    expect(await prisma.taskReviewRound.findFirst({ where: { taskId } })).toMatchObject({ status: "CANCELLED", closeReason: "TASK_DELETED" });
  });

  it("onTaskEntered: thẻ tạo thẳng vào cột REVIEW (không qua move) được mở lượt một lần; onTaskDeleted đóng lượt", async () => {
    await setup({ A: "OWNER", B: "MEMBER", C: "MEMBER", D: "MEMBER" }, 2);
    const direct = (await api("post", `/boards/${board.id}/tasks`, as("A"), { title: "Tạo thẳng vào REVIEW", columnId: col("REVIEW"), assigneeIds: [g.ids.B] })).body.data;
    expect(await prisma.taskReviewRound.count({ where: { taskId: direct.id } })).toBe(0);

    expect(await reconcile().onTaskEntered(direct.id)).toBe(true);
    expect(await reconcile().onTaskEntered(direct.id)).toBe(false);
    expect(await prisma.taskReviewRound.count({ where: { taskId: direct.id, status: "OPEN" } })).toBe(1);

    expect(await reconcile().onTaskDeleted(direct.id, board.id)).toBe(true);
    expect(await prisma.taskReviewRound.findFirst({ where: { taskId: direct.id } })).toMatchObject({ status: "CANCELLED", closeReason: "TASK_DELETED" });
  });
});
