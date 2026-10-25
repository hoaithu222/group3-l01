import { toSafeJobId } from "../../../infrastructure/queue/delayed-jobs";
import { newObjectId } from "../../../core/utils/object-id";
import type { NotifyInput } from "../../notifications/public";
import { TASK_EVENTS, type TaskEventPayload } from "../events/project-events";
import { InMemoryProjectDirectory } from "../repositories/project-support.inmemory";
import { InMemoryTaskRepository } from "../repositories/task.repository.inmemory";
import { dueReminderJobId, TaskDueReminderService, type DueReminderJobData, type IReminderQueue } from "../services/task-due-reminder";

class FakeQueue implements IReminderQueue {
  readonly jobs = new Map<string, { data: DueReminderJobData; runAt: Date }>();
  async schedule(jobId: string, data: DueReminderJobData, runAt: Date): Promise<void> {
    if (!this.jobs.has(jobId)) this.jobs.set(jobId, { data, runAt }); // BullMQ bỏ qua jobId trùng
  }
  async cancel(jobId: string): Promise<void> {
    this.jobs.delete(jobId);
  }
}

const NOW = new Date("2026-09-21T08:00:00.000Z");
const DAY = 86_400_000;

async function setup() {
  const tasks = new InMemoryTaskRepository();
  const directory = new InMemoryProjectDirectory();
  const queue = new FakeQueue();
  const sent: NotifyInput[] = [];
  const service = new TaskDueReminderService({
    tasks,
    directory,
    queue,
    now: () => NOW,
    notify: async (input) => {
      sent.push(input);
      directory.notifications.add(input.dedupeKey);
    },
  });
  const creator = newObjectId();
  const assignee = newObjectId();
  directory.members.add(creator);
  directory.members.add(assignee);
  const task = await tasks.create({
    boardId: newObjectId(), workspaceId: newObjectId(), columnId: "c_aaaaaaaa", columnKind: "TODO", position: "a0", title: "Nộp báo cáo",
    normalizedTitle: "nop bao cao", assigneeIds: [assignee], labelIds: [], dueDate: null, dueVersion: 0, completedAt: null, completionCount: 0,
    createdBy: creator, clientTaskId: null,
  });
  const dueChanged = (dueVersion: number, newDue: Date | null): TaskEventPayload => ({
    event: TASK_EVENTS.DUE_CHANGED, taskId: task.id, boardId: task.boardId, workspaceId: task.workspaceId, actorId: creator,
    oldDue: null, newDue: newDue ? newDue.toISOString() : null, dueVersion,
  });
  const setDue = (dueDate: Date | null, dueVersion: number) => Object.assign(tasks.tasks.get(task.id)!, { dueDate, dueVersion });
  return { tasks, directory, queue, sent, service, task, creator, assignee, dueChanged, setDue };
}

describe("TaskDueReminderService — hẹn giờ", () => {
  it("PM2-18: đặt hạn → đổi giờ → hoàn thành: chỉ MỘT job (đúng phiên bản mới, hạn − 24 h) tồn tại; sau hoàn thành không còn job và không gửi", async () => {
    const { service, queue, sent, task, dueChanged, setDue, tasks } = await setup();
    const at10 = new Date(NOW.getTime() + 3 * DAY);
    const at14 = new Date(at10.getTime() + 4 * 3_600_000);

    setDue(at10, 1);
    await service.handleEvent(dueChanged(1, at10));
    expect([...queue.jobs.keys()]).toEqual([dueReminderJobId(task.id, 1)]);
    expect(queue.jobs.get(dueReminderJobId(task.id, 1))?.runAt).toEqual(new Date(at10.getTime() - DAY));

    setDue(at14, 2);
    await service.handleEvent(dueChanged(2, at14));
    expect([...queue.jobs.keys()]).toEqual([dueReminderJobId(task.id, 2)]); // job cũ đã bị huỷ
    expect(queue.jobs.get(dueReminderJobId(task.id, 2))).toMatchObject({ data: { taskId: task.id, dueVersion: 2 }, runAt: new Date(at14.getTime() - DAY) });

    Object.assign(tasks.tasks.get(task.id)!, { completedAt: NOW });
    await service.handleEvent({ event: TASK_EVENTS.COMPLETED, taskId: task.id } as unknown as TaskEventPayload);
    expect(queue.jobs.size).toBe(0);
    await expect(service.process({ taskId: task.id, dueVersion: 2 })).resolves.toBe("skipped"); // job lọt lưới vẫn không gửi
    expect(sent).toHaveLength(0);
  });

  it("hạn quá gần (< 24 h) → không hẹn; xoá hạn → huỷ job cũ, không hẹn mới; hạn chưa có → bỏ qua", async () => {
    const { service, queue, task, dueChanged, setDue } = await setup();
    await service.handleEvent(dueChanged(1, new Date(NOW.getTime() + 12 * 3_600_000)));
    expect(queue.jobs.size).toBe(0);

    setDue(new Date(NOW.getTime() + 3 * DAY), 1);
    await service.handleEvent(dueChanged(1, new Date(NOW.getTime() + 3 * DAY)));
    expect(queue.jobs.size).toBe(1);
    await service.handleEvent(dueChanged(2, null));
    expect(queue.jobs.has(dueReminderJobId(task.id, 1))).toBe(false);
    expect(queue.jobs.size).toBe(0);
  });

  it("xoá thẻ → huỷ; khôi phục / mở lại → hẹn lại theo dueVersion hiện tại; thẻ đã hoàn thành/đã xoá thì không hẹn", async () => {
    const { service, queue, task, setDue, tasks } = await setup();
    setDue(new Date(NOW.getTime() + 3 * DAY), 3);
    const restored = { event: TASK_EVENTS.RESTORED, taskId: task.id } as unknown as TaskEventPayload;
    await service.handleEvent(restored);
    expect([...queue.jobs.keys()]).toEqual([dueReminderJobId(task.id, 3)]);

    await service.handleEvent({ event: TASK_EVENTS.DELETED, taskId: task.id } as unknown as TaskEventPayload);
    expect(queue.jobs.size).toBe(0);

    Object.assign(tasks.tasks.get(task.id)!, { completedAt: NOW });
    await service.handleEvent({ event: TASK_EVENTS.REOPENED, taskId: task.id } as unknown as TaskEventPayload);
    expect(queue.jobs.size).toBe(0); // vẫn hoàn thành
    Object.assign(tasks.tasks.get(task.id)!, { completedAt: null });
    await service.handleEvent({ event: TASK_EVENTS.REOPENED, taskId: task.id } as unknown as TaskEventPayload);
    expect(queue.jobs.size).toBe(1);
  });

  it("jobId có 3 dấu ':' → phải qua toSafeJobId (BullMQ ném 'Custom Id cannot contain :') và tạo/huỷ ra CÙNG một id", () => {
    const raw = dueReminderJobId("6a".repeat(12), 7);
    expect(raw.split(":")).toHaveLength(4);
    expect(toSafeJobId(raw)).not.toContain(":");
    expect(toSafeJobId(raw)).toBe(`task.due-reminder_task_${"6a".repeat(12)}_d7`);
  });
});

describe("TaskDueReminderService.process — processor", () => {
  it("gửi TASK_DUE_SOON cho người làm (refs chỉ id + tiêu đề), scope WORKSPACE, dedupeKey theo dueVersion; gọi lần hai (retry) không gửi lại", async () => {
    const { service, sent, task, assignee, setDue } = await setup();
    setDue(new Date(NOW.getTime() + DAY), 2);

    await expect(service.process({ taskId: task.id, dueVersion: 2 })).resolves.toBe("sent");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      type: "task.due-soon",
      scope: { type: "WORKSPACE", id: task.workspaceId },
      workspaceId: task.workspaceId,
      dedupeKey: `task.due-soon:task:${task.id}:d2`,
      recipients: [{ userId: assignee }],
      refs: { taskId: task.id, boardId: task.boardId, taskTitle: "Nộp báo cáo" },
    });
    await expect(service.process({ taskId: task.id, dueVersion: 2 })).resolves.toBe("skipped");
    expect(sent).toHaveLength(1);
  });

  it("thẻ chưa giao ai → gửi cho người tạo; người nhận không còn là thành viên → bỏ", async () => {
    const { service, sent, task, creator, directory, tasks, setDue } = await setup();
    setDue(new Date(NOW.getTime() + DAY), 1);
    Object.assign(tasks.tasks.get(task.id)!, { assigneeIds: [] });
    await service.process({ taskId: task.id, dueVersion: 1 });
    expect(sent[0].recipients).toEqual([{ userId: creator }]);

    sent.length = 0;
    directory.notifications.clear();
    directory.members.delete(creator);
    await expect(service.process({ taskId: task.id, dueVersion: 1 })).resolves.toBe("skipped");
    expect(sent).toHaveLength(0);
  });

  it("KHÔNG gửi khi: dueVersion lệch (đã đổi hạn), thẻ đã xoá, đã hoàn thành, đã xoá hạn, thẻ không còn", async () => {
    const { service, sent, task, tasks, setDue } = await setup();
    setDue(new Date(NOW.getTime() + DAY), 2);
    await expect(service.process({ taskId: task.id, dueVersion: 1 })).resolves.toBe("skipped");

    Object.assign(tasks.tasks.get(task.id)!, { completedAt: NOW });
    await expect(service.process({ taskId: task.id, dueVersion: 2 })).resolves.toBe("skipped");
    Object.assign(tasks.tasks.get(task.id)!, { completedAt: null, deletedAt: NOW });
    await expect(service.process({ taskId: task.id, dueVersion: 2 })).resolves.toBe("skipped");
    Object.assign(tasks.tasks.get(task.id)!, { deletedAt: null, dueDate: null });
    await expect(service.process({ taskId: task.id, dueVersion: 2 })).resolves.toBe("skipped");
    await expect(service.process({ taskId: newObjectId(), dueVersion: 1 })).resolves.toBe("skipped");
    expect(sent).toHaveLength(0);
  });
});
