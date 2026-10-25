import { installMocks, redisStore } from "./projects-test-mocks";
import { buildProjectsApp, cleanupGroups, ensureProjectIndexes, makeApi, mutationId, seedGroup, tokenFor, type Group } from "./projects-test-kit";
import { prisma } from "../../../../infrastructure/database";

// Không có Redis/BullMQ thật: huỷ/hẹn job nhắc là no-op.
jest.mock("../../../../infrastructure/queue", () => ({
  ...jest.requireActual("../../../../infrastructure/queue"),
  cancelJob: jest.fn(),
  scheduleAt: jest.fn(),
}));

jest.setTimeout(90_000);

const app = buildProjectsApp();
const api = makeApi(app);

type Board = { id: string; version: number; columns: { id: string; title: string; kind: string }[] };

/**
 * p4-05 — `autoCompleteOnApproval` (P1) và đóng hở vào DONE không qua `move` (integration, Mongo memory replset: transaction/rollback THẬT).
 */
describe("p4-05 chấm chéo — tự chuyển Done + đóng hở vào DONE (integration)", () => {
  const groups: Group[] = [];
  let g: Group;
  let board: Board;

  beforeAll(async () => {
    await ensureProjectIndexes();
    await prisma.$runCommandRaw({ createIndexes: "OutboxEvent", indexes: [{ key: { dedupeKey: 1 }, name: "OutboxEvent_dedupeKey_key", unique: true }] });
  });
  beforeEach(async () => {
    installMocks();
    g = await seedGroup({ A: "OWNER", B: "MEMBER", C: "MEMBER", D: "MEMBER", G: "GUEST" });
    groups.push(g);
    board = (await api("post", `/workspaces/${g.workspaceId}/boards`, as("A"), { name: "Đồ án" })).body.data;
  });
  afterEach(async () => {
    const wsIds = groups.map((x) => x.workspaceId);
    await prisma.notificationRecipient.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await prisma.notification.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await cleanupGroups(groups.splice(0));
    redisStore.clear();
  });

  const as = (who: string) => tokenFor(g.ids[who]);
  const col = (kind: string) => board.columns.find((c) => c.kind === kind)!.id;
  const enable = async (autoCompleteOnApproval: boolean) => {
    const current = (await api("get", `/boards/${board.id}`, as("A"))).body.data as Board;
    const res = await api("put", `/boards/${board.id}/review-config`, as("A"), {
      enabled: true,
      requiredReviews: 2,
      rubric: [],
      reviewerPool: [g.ids.C, g.ids.D],
      autoCompleteOnApproval,
      expectedVersion: current.version,
    });
    expect(res.status).toBe(200);
    board = (await api("get", `/boards/${board.id}`, as("A"))).body.data as Board;
  };
  const move = (who: string, id: string, kind: string, version: number) =>
    api("post", `/tasks/${id}/move`, as(who), { columnId: col(kind), afterTaskId: null, beforeTaskId: null, expectedVersion: version, clientMutationId: mutationId() });
  const task = (id: string) => prisma.task.findUniqueOrThrow({ where: { id } });

  it("autoCompleteOnApproval bật: đủ 2 lượt duyệt ⇒ thẻ TỰ sang DONE (cùng commit), MOVED actor null, task.completed có review.approved; nộp lại → 409; lượt duyệt đầu chưa move", async () => {
    await enable(true);
    const created = (await api("post", `/boards/${board.id}/tasks`, as("A"), { title: "Thẻ tự xong", assigneeIds: [g.ids.B] })).body.data as { id: string; version: number };
    const toReview = await move("B", created.id, "REVIEW", created.version);
    expect(toReview.status).toBe(200);
    const reviews = await prisma.taskReview.findMany({ where: { taskId: created.id }, orderBy: { assignedAt: "asc" } });
    expect(reviews).toHaveLength(2);
    const asReviewer = (r: { reviewerId: string }) => tokenFor(r.reviewerId);
    const submit = (r: { id: string; reviewerId: string; version: number }) =>
      api("post", `/task-reviews/${r.id}/submit`, asReviewer(r), { status: "APPROVED", rubricScores: [], score10: 9, expectedVersion: r.version });

    const first = await submit(reviews[0]);
    expect(first.status).toBe(200);
    expect(first.body.data.task).toMatchObject({ reviewState: "PENDING", columnKind: "REVIEW" });
    expect((await task(created.id)).columnKind).toBe("REVIEW");

    const last = await submit(reviews[1]);
    expect(last.status).toBe(200);
    expect(last.body.data.round).toMatchObject({ status: "APPROVED", approvedCount: 2 });
    expect(last.body.data.task).toMatchObject({ reviewState: "APPROVED", columnKind: "DONE", columnId: col("DONE") });

    const stored = await task(created.id);
    expect(stored).toMatchObject({ columnKind: "DONE", columnId: col("DONE"), reviewState: "APPROVED", completionCount: 1 });
    expect(stored.completedAt).not.toBeNull();
    const moved = await prisma.taskActivity.findMany({ where: { taskId: created.id, type: "MOVED" }, orderBy: { at: "asc" } });
    expect(moved.map((a) => a.actorId)).toEqual([g.ids.B, null]); // kéo vào REVIEW (B) rồi hệ thống chuyển DONE
    const completed = await prisma.outboxEvent.findMany({ where: { type: "task.completed", aggregateId: created.id } });
    expect(completed).toHaveLength(1);
    expect(completed[0].payload).toMatchObject({ actorId: null, completionCount: 1, review: { enabled: true, approved: true } });

    const again = await submit({ ...reviews[1], version: 2 });
    expect([again.status, again.body.error.code]).toEqual([409, "REVIEW_001"]);
    expect(await prisma.outboxEvent.count({ where: { type: "task.completed", aggregateId: created.id } })).toBe(1);
  });

  it("autoCompleteOnApproval tắt (mặc định): đủ duyệt vẫn ở REVIEW, người làm tự kéo Done được", async () => {
    await enable(false);
    const created = (await api("post", `/boards/${board.id}/tasks`, as("A"), { title: "Thẻ thủ công", assigneeIds: [g.ids.B] })).body.data as { id: string; version: number };
    await move("B", created.id, "REVIEW", created.version);
    for (const r of await prisma.taskReview.findMany({ where: { taskId: created.id } })) {
      const res = await api("post", `/task-reviews/${r.id}/submit`, tokenFor(r.reviewerId), { status: "APPROVED", rubricScores: [], score10: 8, expectedVersion: r.version });
      expect(res.status).toBe(200);
    }
    expect(await task(created.id)).toMatchObject({ columnKind: "REVIEW", reviewState: "APPROVED" });
    const done = await move("B", created.id, "DONE", (await task(created.id)).version);
    expect(done.status).toBe(200);
  });

  it("tạo thẳng vào cột DONE khi bảng bật chấm chéo → 409 TASK_002 REVIEW_REQUIRED và transaction ROLLBACK (không để lại thẻ, không outbox)", async () => {
    await enable(false);
    const taskEvents = { type: { in: ["task.created", "task.completed"] } };
    const outboxBefore = await prisma.outboxEvent.count({ where: taskEvents });
    const res = await api("post", `/boards/${board.id}/tasks`, as("B"), { title: "Lách luật", assigneeIds: [], columnId: col("DONE") });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: "TASK_002", details: { reason: "REVIEW_REQUIRED", approvedCount: 0, requiredReviews: 2, roundStatus: "NONE" } });
    expect(await prisma.task.count({ where: { boardId: board.id } })).toBe(0);
    expect(await prisma.outboxEvent.count({ where: taskEvents })).toBe(outboxBefore);

    // Cột khác vẫn tạo được.
    expect((await api("post", `/boards/${board.id}/tasks`, as("B"), { title: "Việc thường", assigneeIds: [] })).status).toBe(201);
  });

  it("khôi phục về cột đã đổi thành DONE (thẻ chưa hoàn thành lúc xoá) → 409 TASK_002; thẻ vẫn ở thùng rác; tắt chấm chéo thì khôi phục được", async () => {
    await enable(false);
    const created = (await api("post", `/boards/${board.id}/tasks`, as("B"), { title: "Thẻ vào thùng rác", assigneeIds: [] })).body.data as { id: string };
    expect((await api("delete", `/tasks/${created.id}`, as("B"))).status).toBe(204);

    // TODO ↔ DONE đổi loại: cả hai cột đều không còn thẻ SỐNG nên PUT columns cho phép.
    const current = (await api("get", `/boards/${board.id}`, as("A"))).body.data as Board;
    const swapped = current.columns.map((c) => ({ id: c.id, title: c.title, kind: c.kind === "TODO" ? "DONE" : c.kind === "DONE" ? "TODO" : c.kind }));
    expect((await api("put", `/boards/${board.id}/columns`, as("A"), { columns: swapped, expectedVersion: current.version })).status).toBe(200);

    const blocked = await api("post", `/tasks/${created.id}/restore`, as("B"));
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatchObject({ code: "TASK_002", details: { reason: "REVIEW_REQUIRED", roundStatus: "NONE" } });
    const still = await task(created.id);
    expect(still.deletedAt).not.toBeNull();
    expect(still.completedAt).toBeNull();
    expect(await prisma.outboxEvent.count({ where: { type: { in: ["task.restored", "task.completed"] }, aggregateId: created.id } })).toBe(0);

    // Tắt chấm chéo ⇒ khôi phục về DONE và hoàn thành đúng MỘT lần.
    const cfg = (await api("get", `/boards/${board.id}/review-config`, as("A"))).body.data as { version: number };
    expect((await api("put", `/boards/${board.id}/review-config`, as("A"), { enabled: false, requiredReviews: 2, rubric: [], autoCompleteOnApproval: false, expectedVersion: cfg.version })).status).toBe(200);
    expect((await api("post", `/tasks/${created.id}/restore`, as("B"))).status).toBe(200);
    expect(await task(created.id)).toMatchObject({ deletedAt: null, columnKind: "DONE", completionCount: 1 });
    expect(await prisma.outboxEvent.count({ where: { type: "task.completed", aggregateId: created.id } })).toBe(1);
  });
});
