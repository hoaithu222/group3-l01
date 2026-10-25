import { installMocks, redisStore } from "./projects-test-mocks";

/** Bắt processor mà file job đăng ký (`registerJob` giữ processor trong Map riêng tư) để gọi trực tiếp như worker. */
const registered = new Map<string, (job: { id?: string; data: unknown }) => Promise<unknown>>();
jest.mock("../../../../infrastructure/queue", () => ({
  ...jest.requireActual("../../../../infrastructure/queue"),
  registerJob: jest.fn((queue: string, name: string, fn: (job: { id?: string; data: unknown }) => Promise<unknown>) => {
    registered.set(`${queue}/${name}`, fn);
  }),
}));

import { buildProjectsApp, cleanupGroups, makeApi, seedGroup, tokenFor, type Group } from "./projects-test-kit";
import { prisma } from "../../../../infrastructure/database";
import { needsRebalance } from "../../services/task-position";
import { clearTaskEventSinks, registerTaskEventSink } from "../../events/task-event-sinks";
import { TASK_EVENTS, type TaskEventPayload } from "../../events/project-events";
import vectors from "../fixtures/fractional-indexing-vectors.json";

const app = buildProjectsApp();
const api = makeApi(app);

describe("projects — job (processor đăng ký đúng queue/jobName, chạy trên Mongo thật)", () => {
  const groups: Group[] = [];

  beforeAll(async () => {
    await import("../../jobs/board-rebalance-column.job");
    await import("../../jobs/task-events.consumer");
    await import("../../jobs/task-notification.consumer");
    await import("../../jobs/task-due-reminder.job");
  });
  beforeEach(() => installMocks());
  afterEach(async () => {
    clearTaskEventSinks();
    const wsIds = groups.map((x) => x.workspaceId);
    await prisma.notificationRecipient.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await prisma.notification.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await cleanupGroups(groups.splice(0));
    redisStore.clear();
  });

  it("đăng ký đúng `cron/board.rebalance-column`, `notifications/task.events` và (p3-03) `notifications/task.due-reminder`", () => {
    expect([...registered.keys()].sort()).toEqual(["cron/board.rebalance-column", "notifications/task.due-reminder", "notifications/task.events"]);
  });

  it("p3-03 task.due-reminder (Mongo + notify() thật): gửi TASK_DUE_SOON cho người làm; retry không gửi lại; dueVersion lệch/thẻ đã xoá/hoàn thành/payload sai → bỏ qua không ném", async () => {
    const g = await seedGroup({ A: "OWNER", C: "MEMBER", D: "MEMBER" });
    groups.push(g);
    const board = (await api("post", `/workspaces/${g.workspaceId}/boards`, tokenFor(g.ids.A), { name: "B" })).body.data as { id: string; columns: { id: string; kind: string }[] };
    const due = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const created = (await api("post", `/boards/${board.id}/tasks`, tokenFor(g.ids.C), { title: "Nộp báo cáo", assigneeIds: [g.ids.D], dueDate: due })).body.data as { id: string };
    const handler = registered.get("notifications/task.due-reminder")!;
    const notifications = () => prisma.notification.findMany({ where: { workspaceId: g.workspaceId, type: "task.due-soon" } });

    await handler({ id: "j0", data: { taskId: created.id, dueVersion: 99 } }); // dueVersion lệch (đã đổi hạn)
    await handler({ id: "j1", data: null });
    await handler({ id: "j2", data: { taskId: 5 } });
    await handler({ id: "j3", data: { taskId: "f".repeat(24), dueVersion: 1 } }); // thẻ không tồn tại
    expect(await notifications()).toHaveLength(0);

    await handler({ id: "j4", data: { taskId: created.id, dueVersion: 1 } });
    await handler({ id: "j5", data: { taskId: created.id, dueVersion: 1 } }); // BullMQ retry
    const sent = await notifications();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ scopeType: "WORKSPACE", scopeId: g.workspaceId, dedupeKey: `task.due-soon:task:${created.id}:d1` });
    expect(sent[0].refs).toMatchObject({ taskId: created.id, taskTitle: "Nộp báo cáo" });
    const recipients = await prisma.notificationRecipient.findMany({ where: { notificationId: sent[0].id } });
    expect(recipients.map((r) => r.recipientId)).toEqual([g.ids.D]);

    // Đổi hạn (dueVersion 2) rồi xử lý job CŨ d1 → bỏ qua; hoàn thành thẻ → job d2 cũng bỏ qua.
    await prisma.task.update({ where: { id: created.id }, data: { dueVersion: 2 } });
    await prisma.notification.deleteMany({ where: { workspaceId: g.workspaceId } });
    await prisma.notificationRecipient.deleteMany({ where: { workspaceId: g.workspaceId } });
    await handler({ id: "j6", data: { taskId: created.id, dueVersion: 1 } });
    await prisma.task.update({ where: { id: created.id }, data: { completedAt: new Date() } });
    await handler({ id: "j7", data: { taskId: created.id, dueVersion: 2 } });
    expect(await notifications()).toHaveLength(0);
  });

  it("board.rebalance-column: nén khoá cột dài, giữ thứ tự; payload sai định dạng bị bỏ qua không ném", async () => {
    const g = await seedGroup({ A: "OWNER" });
    groups.push(g);
    const board = (await api("post", `/workspaces/${g.workspaceId}/boards`, tokenFor(g.ids.A), { name: "B" })).body.data as { id: string; columns: { id: string }[] };
    const columnId = board.columns[0].id;
    const positions = [...new Set(["a0", ...(vectors.slot as { value: string }[]).map((s) => s.value), "a1"])].sort();
    await prisma.task.createMany({
      data: positions.map((position, i) => ({
        boardId: board.id, workspaceId: g.workspaceId, columnId, columnKind: "TODO" as const,
        position, title: `t${i}`, normalizedTitle: `t${i}`, createdBy: g.ids.A, deletedAt: null,
      })),
    });
    const order = async () => (await prisma.task.findMany({ where: { boardId: board.id }, orderBy: [{ position: "asc" }, { id: "asc" }] })).map((t) => t);
    const before = await order();
    expect(before.some((t) => needsRebalance(t.position))).toBe(true);

    const handler = registered.get("cron/board.rebalance-column")!;
    await handler({ id: "job-1", data: { boardId: board.id, columnId } });

    const after = await order();
    expect(after.map((t) => t.id)).toEqual(before.map((t) => t.id));
    expect(after.some((t) => needsRebalance(t.position))).toBe(false);

    await expect(handler({ id: "job-2", data: { boardId: "sai", columnId } })).resolves.toBeUndefined();
    await expect(handler({ id: "job-3", data: null })).resolves.toBeUndefined();
  });

  it("task.events: chuyển payload cho mọi sink đã đăng ký; payload lạ bị bỏ qua; sink lỗi → job ném (BullMQ retry)", async () => {
    const handler = registered.get("notifications/task.events")!;
    const seen: string[] = [];
    registerTaskEventSink("test", async (p, jobId) => void seen.push(`${p.event}:${p.taskId}:${jobId}`));
    const payload = { event: TASK_EVENTS.COMPLETED, taskId: "t1", boardId: "b1", workspaceId: "w1", actorId: "u1" } as unknown as TaskEventPayload;

    await handler({ id: "task.completed_task_t1_c1", data: payload });
    expect(seen).toEqual(["task.completed:t1:task.completed_task_t1_c1"]);

    await expect(handler({ id: "x", data: { foo: "bar" } })).resolves.toBeUndefined();
    expect(seen).toHaveLength(1);

    registerTaskEventSink("boom", async () => {
      throw new Error("sink hỏng");
    });
    await expect(handler({ id: "y", data: payload })).rejects.toThrow(/sink lỗi: boom/);
  });
});
