import { installMocks, redisStore } from "./projects-test-mocks";

/** Bắt processor mà file job đăng ký để gọi trực tiếp như worker (import ở `beforeAll`: `resetMocks` xoá cài đặt giả trước MỖI test). */
const registered = new Map<string, (job: { id?: string; data: unknown }) => Promise<unknown>>();
jest.mock("../../../../infrastructure/queue", () => ({
  ...jest.requireActual("../../../../infrastructure/queue"),
  registerJob: jest.fn((queue: string, name: string, fn: (job: { id?: string; data: unknown }) => Promise<unknown>) => {
    registered.set(`${queue}/${name}`, fn);
  }),
}));

import { buildProjectsApp, cleanupGroups, ensureProjectIndexes, makeApi, seedChain, seedGroup, tokenFor, type Group } from "./projects-test-kit";
import { prisma } from "../../../../infrastructure/database";
import { dispatchTaskEvent } from "../../events/task-event-sinks";
import { TASK_EVENTS, type TaskEventPayload } from "../../events/project-events";
import { getProjectsContainer } from "../../projects.container";
import { SocketBoardEmitter } from "../../realtime/board-emitter";

// Mongo memory replset chậm (mỗi request/transaction tính bằng trăm ms trên Windows) — các ca có nhiều lời gọi tuần tự cần trần rộng hơn 5 s mặc định.
jest.setTimeout(90_000);

const app = buildProjectsApp();
const api = makeApi(app);

type Board = { id: string; columns: { id: string; kind: string }[] };

describe("projects p4-04 — bộ đếm phụ thuộc: sink task.events + cron dependency-counts.rebuild (integration)", () => {
  const groups: Group[] = [];
  let g: Group;
  let board: Board;
  let ids: string[]; // root → T1 → T2 → T3

  beforeAll(async () => {
    await ensureProjectIndexes();
    await import("../../jobs/dependency-counts.job");
    await import("../../jobs/dependency-counts-rebuild.job");
  });
  beforeEach(async () => {
    installMocks();
    g = await seedGroup({ A: "OWNER", C: "MEMBER" });
    groups.push(g);
    board = (await api("post", `/workspaces/${g.workspaceId}/boards`, tokenFor(g.ids.A), { name: "Đồ án" })).body.data;
    ids = await seedChain(board.id, g.workspaceId, board.columns[0].id, g.ids.C, 3);
  });
  afterEach(async () => {
    await cleanupGroups(groups.splice(0));
    redisStore.clear();
  });

  const counts = async (id: string) => {
    const t = await prisma.task.findUniqueOrThrow({ where: { id } });
    return [t.blockedByCount, t.blockingCount];
  };
  const version = async (id: string) => (await prisma.task.findUniqueOrThrow({ where: { id } })).version;
  const base = () => ({ taskId: ids[1], boardId: board.id, workspaceId: g.workspaceId, actorId: g.ids.C });
  const completed = (): TaskEventPayload => ({
    event: TASK_EVENTS.COMPLETED,
    ...base(),
    assigneeIds: [],
    storyPoints: null,
    dueDate: null,
    completedAt: new Date().toISOString(),
    onTime: false,
    completionCount: 1,
    taskCreatedAt: new Date().toISOString(),
    labelNames: [],
    review: { enabled: false, approved: false },
  });

  it("sink task.completed chạy 3 lần → bộ đếm đúng MỘT giá trị (đếm lại từ cạnh, không ±1), chỉ thẻ đổi mới bị ghi + phát task:updated; reopened/deleted/restored đếm lại đúng", async () => {
    const emitted: { id: string; changed: string[] | undefined }[] = [];
    jest.spyOn(SocketBoardEmitter.prototype, "taskUpdated").mockImplementation((_b, payload) => void emitted.push({ id: payload.task.id, changed: payload.changed }));
    expect([await counts(ids[0]), await counts(ids[1]), await counts(ids[2]), await counts(ids[3])]).toEqual([[0, 1], [1, 1], [1, 1], [1, 0]]);

    await prisma.task.update({ where: { id: ids[1] }, data: { columnKind: "DONE", completedAt: new Date(), completionCount: 1 } }); // hoàn thành T1
    const [v0, v2] = [await version(ids[0]), await version(ids[2])];
    for (let i = 0; i < 3; i += 1) await dispatchTaskEvent(completed(), `task.completed_task_${i}`);
    expect(await counts(ids[0])).toEqual([0, 0]); // T1(DONE) không còn bị root "chặn"
    expect(await counts(ids[2])).toEqual([0, 1]); // T2 không còn bị T1 chặn
    expect([await counts(ids[1]), await counts(ids[3])]).toEqual([[1, 1], [1, 0]]); // hàng xóm khác giữ nguyên
    expect([await version(ids[0]), await version(ids[2])]).toEqual([v0 + 1, v2 + 1]); // ghi ĐÚNG một lần dù chạy 3 lần
    expect(emitted.map((e) => e.id).sort()).toEqual([ids[0], ids[2]].sort());
    expect(emitted.every((e) => e.changed?.[0] === "dependencies")).toBe(true);

    // Mở lại T1 → đếm lại về như cũ.
    await prisma.task.update({ where: { id: ids[1] }, data: { columnKind: "TODO", completedAt: null } });
    const reopened: TaskEventPayload = { event: TASK_EVENTS.REOPENED, ...base(), assigneeIds: [], completionCount: 1, reopenedAt: new Date().toISOString() };
    await dispatchTaskEvent(reopened, "task.reopened_a");
    await dispatchTaskEvent(reopened, "task.reopened_b");
    expect([await counts(ids[0]), await counts(ids[2])]).toEqual([[0, 1], [1, 1]]);

    // Xoá mềm T2 → T1 không còn chặn thẻ nào; T3 không còn bị chặn. Khôi phục → như cũ.
    await prisma.task.update({ where: { id: ids[2] }, data: { deletedAt: new Date(), deletedBy: g.ids.C } });
    const deleted: TaskEventPayload = { event: TASK_EVENTS.DELETED, taskId: ids[2], boardId: board.id, workspaceId: g.workspaceId, actorId: g.ids.C, columnId: board.columns[0].id };
    await dispatchTaskEvent(deleted, "task.deleted_a");
    expect([await counts(ids[1]), await counts(ids[3])]).toEqual([[1, 0], [0, 0]]);
    await prisma.task.update({ where: { id: ids[2] }, data: { deletedAt: null, deletedBy: null } });
    await dispatchTaskEvent({ ...deleted, event: TASK_EVENTS.RESTORED }, "task.restored_a");
    expect([await counts(ids[1]), await counts(ids[3])]).toEqual([[1, 1], [1, 0]]);

    // Sự kiện không liên quan (created…) → bỏ qua, không ghi.
    const vBefore = await version(ids[1]);
    await dispatchTaskEvent({ event: TASK_EVENTS.CREATED, ...base(), columnId: "c", createdBy: g.ids.C, assigneeIds: [], dueDate: null, createdAt: new Date().toISOString() }, "task.created_a");
    expect(await version(ids[1])).toBe(vBefore);
  }, 60_000);

  it("cron dependency-counts.rebuild: sửa bộ đếm lệch (kể cả thẻ mồ côi không còn cạnh) trên Mongo thật; chạy lần hai không sửa gì", async () => {
    const orphan = (await api("post", `/boards/${board.id}/tasks`, tokenFor(g.ids.C), { title: "Mồ côi" })).body.data as { id: string };
    await prisma.task.update({ where: { id: ids[0] }, data: { blockedByCount: 3, blockingCount: 0 } });
    await prisma.task.update({ where: { id: ids[2] }, data: { blockingCount: 9 } });
    await prisma.task.update({ where: { id: orphan.id }, data: { blockedByCount: 2, blockingCount: 2 } });

    await registered.get("cron/dependency-counts.rebuild")!({ id: "cron-1", data: {} });
    expect(await counts(ids[0])).toEqual([0, 1]);
    expect(await counts(ids[1])).toEqual([1, 1]);
    expect(await counts(ids[2])).toEqual([1, 1]);
    expect(await counts(ids[3])).toEqual([1, 0]);
    expect(await counts(orphan.id)).toEqual([0, 0]);

    // Thẻ hoàn thành KHÔNG được tính là "đang chặn": T3 DONE ⇒ T2.blockingCount đúng là 0; job sửa lại từ trạng thái lệch.
    await prisma.task.update({ where: { id: ids[3] }, data: { columnKind: "DONE", completedAt: new Date(), completionCount: 1 } });
    const fixed = await getProjectsContainer().countsRebuildService.rebuildAll();
    expect(fixed.failed).toBe(0);
    expect(fixed.fixed).toBeGreaterThanOrEqual(1);
    expect(await counts(ids[2])).toEqual([1, 0]);

    const second = await getProjectsContainer().countsRebuildService.rebuildAll();
    expect(second).toMatchObject({ fixed: 0, failed: 0 });
    expect(second.boards).toBeGreaterThanOrEqual(1);
  }, 60_000);
});
