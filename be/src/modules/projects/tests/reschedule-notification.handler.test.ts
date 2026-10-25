import { newObjectId } from "../../../core/utils/object-id";
import { getNotificationType, type NotifyInput } from "../../notifications/public";
import { TASK_EVENTS, type TaskEventPayload, type TaskRescheduleBulkCompletedPayload, type TaskRescheduledPayload } from "../events/project-events";
import { InMemoryProjectDirectory } from "../repositories/project-support.inmemory";
import { InMemoryTaskRepository } from "../repositories/task.repository.inmemory";
import { RescheduleNotificationHandler } from "../services/reschedule-notification.handler";
import { RESCHEDULE_NOTIFICATION_TYPES, registerTaskNotificationTypes } from "../services/task-notification.types";

async function setup() {
  const tasks = new InMemoryTaskRepository();
  const directory = new InMemoryProjectDirectory();
  const sent: NotifyInput[] = [];
  const handler = new RescheduleNotificationHandler({
    tasks,
    directory,
    notify: async (input) => {
      sent.push(input);
      directory.notifications.add(input.dedupeKey);
    },
  });
  const [actor, lan, kim, minh, outsider] = [1, 2, 3, 4, 5].map(() => newObjectId());
  for (const id of [actor, lan, kim, minh]) directory.members.add(id);
  const boardId = newObjectId();
  const workspaceId = newObjectId();
  const source = await tasks.create({
    boardId, workspaceId, columnId: "c_aaaaaaaa", columnKind: "TODO", position: "a0", title: "Thẻ nguồn", normalizedTitle: "the nguon",
    assigneeIds: [], labelIds: [], dueDate: null, dueVersion: 0, completedAt: null, completionCount: 0, createdBy: actor, clientTaskId: null,
  });
  const rescheduled = (items: { taskId: string; assigneeIds: string[] }[], over: Partial<TaskRescheduledPayload> = {}): TaskRescheduledPayload => ({
    event: TASK_EVENTS.RESCHEDULED,
    taskId: source.id,
    sourceTaskId: source.id,
    boardId,
    workspaceId,
    actorId: actor,
    rescheduleId: newObjectId(),
    batchId: null,
    items: items.map((i) => ({ ...i, oldDueDate: null, newDueDate: null })),
    ...over,
  });
  return { tasks, directory, sent, handler, actor, lan, kim, minh, outsider, boardId, workspaceId, source, rescheduled };
}

describe("RescheduleNotificationHandler — task.rescheduled (PM2-04: một thông báo mỗi người mỗi lần dời)", () => {
  it("gộp các thẻ của CÙNG người thành MỘT thông báo (count + taskIds); loại người thực hiện; dedupeKey/source/scope đúng", async () => {
    const { handler, sent, actor, lan, kim, boardId, workspaceId, source, rescheduled } = await setup();
    const [b, c, d, e] = [newObjectId(), newObjectId(), newObjectId(), newObjectId()];
    const evt = rescheduled([
      { taskId: b, assigneeIds: [lan] },
      { taskId: c, assigneeIds: [lan, kim] },
      { taskId: d, assigneeIds: [actor] }, // thẻ của chính người thực hiện → không tự thông báo
      { taskId: e, assigneeIds: [] },
    ]);
    await handler.handle(evt);

    expect(sent.map((s) => s.recipients[0].userId).sort()).toEqual([lan, kim].sort());
    const toLan = sent.find((s) => s.recipients[0].userId === lan)!;
    expect(toLan).toMatchObject({
      type: "task.rescheduled",
      actorId: actor,
      scope: { type: "WORKSPACE", id: workspaceId },
      workspaceId,
      source: { type: "TASK_RESCHEDULE", id: `reschedule:${evt.rescheduleId}` },
      dedupeKey: `reschedule:${evt.rescheduleId}:${lan}`,
      recipients: [{ userId: lan }],
      refs: { taskId: source.id, sourceTaskId: source.id, boardId, workspaceId, rescheduleId: evt.rescheduleId, taskIds: [b, c], count: 2, taskTitle: "Thẻ nguồn" },
    });
    expect(sent.find((s) => s.recipients[0].userId === kim)?.refs).toMatchObject({ taskIds: [c], count: 1 });
  });

  it("idempotent: BullMQ retry cùng sự kiện không gửi lại; sự kiện khác (rescheduleId khác) gửi mới", async () => {
    const { handler, sent, lan, rescheduled } = await setup();
    const evt = rescheduled([{ taskId: newObjectId(), assigneeIds: [lan] }]);
    await handler.handle(evt);
    await handler.handle(evt);
    expect(sent).toHaveLength(1);
    await handler.handle(rescheduled([{ taskId: newObjectId(), assigneeIds: [lan] }]));
    expect(sent).toHaveLength(2);
    expect(sent[0].dedupeKey).not.toBe(sent[1].dedupeKey);
  });

  it("bỏ qua người không còn là thành viên MEMBER+ (đã rời/GUEST); không ai để báo → không gọi notify; refs.taskIds tối đa 20", async () => {
    const { handler, sent, outsider, lan, rescheduled } = await setup();
    await handler.handle(rescheduled([{ taskId: newObjectId(), assigneeIds: [outsider] }]));
    await handler.handle(rescheduled([]));
    expect(sent).toHaveLength(0);

    const many = Array.from({ length: 25 }, () => ({ taskId: newObjectId(), assigneeIds: [lan] }));
    await handler.handle(rescheduled(many));
    expect(sent).toHaveLength(1);
    const refs = sent[0].refs as { taskIds: string[]; count: number };
    expect(refs.count).toBe(25);
    expect(refs.taskIds).toEqual(many.slice(0, 20).map((i) => i.taskId));
  });

  it("thẻ nguồn đã xoá/không còn: vẫn báo, chỉ không có taskTitle", async () => {
    const { handler, sent, tasks, source, lan, rescheduled } = await setup();
    tasks.tasks.get(source.id)!.deletedAt = new Date();
    await handler.handle(rescheduled([{ taskId: newObjectId(), assigneeIds: [lan] }]));
    expect(sent).toHaveLength(1);
    expect(sent[0].refs).not.toHaveProperty("taskTitle");
  });
});

describe("RescheduleNotificationHandler — task.reschedule-bulk.completed", () => {
  const completed = (base: { taskId: string; boardId: string; workspaceId: string }, requestedBy: string, over: Partial<TaskRescheduleBulkCompletedPayload> = {}): TaskRescheduleBulkCompletedPayload => ({
    event: TASK_EVENTS.RESCHEDULE_BULK_COMPLETED,
    ...base,
    actorId: requestedBy,
    batchId: newObjectId(),
    requestedBy,
    sourceTaskId: base.taskId,
    status: "PARTIAL",
    appliedCount: 249,
    conflictCount: 1,
    ...over,
  });

  it("PM2-27: người yêu cầu nhận TASK_RESCHEDULE_BATCH_DONE (249 thẻ, 1 xung đột) đúng MỘT lần", async () => {
    const { handler, sent, actor, boardId, workspaceId, source } = await setup();
    const evt = completed({ taskId: source.id, boardId, workspaceId }, actor);
    await handler.handle(evt);
    await handler.handle(evt);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      type: "task.reschedule-batch-done",
      scope: { type: "WORKSPACE", id: workspaceId },
      source: { type: "TASK_RESCHEDULE_BATCH", id: `reschedule-batch:${evt.batchId}` },
      dedupeKey: `reschedule-batch:${evt.batchId}`,
      recipients: [{ userId: actor }],
      refs: { boardId, workspaceId, batchId: evt.batchId, status: "PARTIAL", appliedCount: 249, conflictCount: 1 },
    });
    expect(sent[0].actorId).toBeUndefined(); // người yêu cầu chính là người nhận — không được loại bởi `notify()`
  });

  it("người yêu cầu đã rời nhóm → không báo; FAILED vẫn báo; sự kiện task khác bị bỏ qua", async () => {
    const { handler, sent, directory, actor, boardId, workspaceId, source } = await setup();
    await handler.handle(completed({ taskId: source.id, boardId, workspaceId }, actor, { status: "FAILED", appliedCount: 10, conflictCount: 0 }));
    expect(sent[0].refs).toMatchObject({ status: "FAILED" });

    directory.members.delete(actor);
    await handler.handle(completed({ taskId: source.id, boardId, workspaceId }, actor));
    expect(sent).toHaveLength(1);

    const other: TaskEventPayload = { event: TASK_EVENTS.CREATED, taskId: source.id, boardId, workspaceId, actorId: actor, columnId: "c", createdBy: actor, assigneeIds: [], dueDate: null, createdAt: new Date().toISOString() };
    await handler.handle(other);
    expect(sent).toHaveLength(1);
  });
});

describe("loại thông báo p4-04 (registerTaskNotificationTypes)", () => {
  it("đăng ký cả hai loại: hộp thư, quyền đọc workspace.board.read, push tự khai (không sửa bảng lõi)", () => {
    registerTaskNotificationTypes();
    for (const type of Object.values(RESCHEDULE_NOTIFICATION_TYPES)) {
      const def = getNotificationType(type);
      expect(def).toMatchObject({ type, inbox: true, pushType: type, readAction: "workspace.board.read", respectMute: "ALWAYS", bypassDnd: false });
    }
  });

  it("mẫu push: không lộ tên thẻ; TASK_RESCHEDULED chỉ nêu số thẻ khi bật xem trước; BATCH_DONE nêu số đếm; dataKeys chỉ chứa id", () => {
    registerTaskNotificationTypes();
    const rescheduled = getNotificationType(RESCHEDULE_NOTIFICATION_TYPES.TASK_RESCHEDULED)!.push!;
    const refs = { taskId: "t1", boardId: "b1", rescheduleId: "r1", taskTitle: "Bí mật", count: 3 };
    expect(rescheduled.template!({ refs, lockScreenPreview: false })).toEqual({ title: "Lịch làm việc của bạn vừa được dời", body: undefined });
    expect(rescheduled.template!({ refs, lockScreenPreview: true }).body).toBe("3 thẻ của bạn được dời lịch");
    expect(JSON.stringify(rescheduled.template!({ refs, lockScreenPreview: true }))).not.toContain("Bí mật");
    expect(rescheduled.dataKeys).toEqual(["boardId", "taskId", "rescheduleId"]);
    expect(rescheduled.collapseKey!(refs)).toBe("task-reschedule:r1");

    const done = getNotificationType(RESCHEDULE_NOTIFICATION_TYPES.TASK_RESCHEDULE_BATCH_DONE)!.push!;
    expect(done.template!({ refs: { batchId: "x", appliedCount: 249, conflictCount: 1, status: "PARTIAL" }, lockScreenPreview: false })).toEqual({ title: "Đã dời lịch xong", body: "Đã dời 249 thẻ, 1 xung đột" });
    expect(done.template!({ refs: { batchId: "x", appliedCount: 5, conflictCount: 0, status: "DONE" }, lockScreenPreview: false }).body).toBe("Đã dời 5 thẻ");
    expect(done.template!({ refs: { batchId: "x", status: "FAILED" }, lockScreenPreview: false }).title).toBe("Dời lịch không hoàn tất");
    expect(done.dataKeys).toEqual(["boardId", "batchId"]);
  });
});
