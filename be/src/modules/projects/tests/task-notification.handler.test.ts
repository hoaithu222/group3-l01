import { newObjectId } from "../../../core/utils/object-id";
import type { NotifyInput } from "../../notifications/public";
import { TASK_EVENTS, type TaskEventPayload } from "../events/project-events";
import { InMemoryProjectDirectory } from "../repositories/project-support.inmemory";
import { InMemoryTaskCommentRepository } from "../repositories/task-comment.repository.inmemory";
import { InMemoryTaskRepository } from "../repositories/task.repository.inmemory";
import { TaskNotificationHandler } from "../services/task-notification.handler";

async function setup() {
  const tasks = new InMemoryTaskRepository();
  const comments = new InMemoryTaskCommentRepository();
  const directory = new InMemoryProjectDirectory();
  const sent: NotifyInput[] = [];
  const handler = new TaskNotificationHandler({
    tasks,
    comments,
    directory,
    notify: async (input) => {
      sent.push(input);
      directory.notifications.add(input.dedupeKey);
    },
  });
  const [creator, assignee, author, mentioned, outsider] = [1, 2, 3, 4, 5].map(() => newObjectId());
  for (const id of [creator, assignee, author, mentioned]) directory.members.add(id);
  const task = await tasks.create({
    boardId: newObjectId(), workspaceId: newObjectId(), columnId: "c_aaaaaaaa", columnKind: "TODO", position: "a0", title: "Thẻ chung",
    normalizedTitle: "the chung", assigneeIds: [assignee], labelIds: [], dueDate: null, dueVersion: 0, completedAt: null, completionCount: 0,
    createdBy: creator, clientTaskId: null,
  });
  const comment = await comments.create(
    { id: newObjectId(), taskId: task.id, boardId: task.boardId, workspaceId: task.workspaceId, authorId: author, clientCommentId: "client-comment-1", content: "Nội dung", mentions: [], attachmentCount: 0 }
  );
  const base = { taskId: task.id, boardId: task.boardId, workspaceId: task.workspaceId };
  return { tasks, comments, directory, sent, handler, task, comment, creator, assignee, author, mentioned, outsider, base };
}

describe("TaskNotificationHandler — task.assigned", () => {
  it("PM2-15: người được giao nhận TASK_ASSIGNED đúng MỘT lần (retry cùng jobId không gửi lại), scope WORKSPACE, refs không có nội dung", async () => {
    const { handler, sent, base, task, assignee, creator } = await setup();
    const evt: TaskEventPayload = { event: TASK_EVENTS.ASSIGNED, ...base, actorId: creator, assigneeIds: [assignee] };

    await handler.handle(evt, "task.assigned_task_x_v3");
    await handler.handle(evt, "task.assigned_task_x_v3"); // BullMQ retry
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      type: "task.assigned", actorId: creator, scope: { type: "WORKSPACE", id: task.workspaceId }, workspaceId: task.workspaceId,
      recipients: [{ userId: assignee }], dedupeKey: "notif.task.assigned_task_x_v3",
      refs: { taskId: task.id, boardId: task.boardId, taskTitle: "Thẻ chung" },
    });
    // Giao lại ở phiên bản khác → thông báo mới (source.id/dedupeKey khác).
    await handler.handle(evt, "task.assigned_task_x_v9");
    expect(sent).toHaveLength(2);
    expect(sent[0].source.id).not.toBe(sent[1].source.id);
  });

  it("bỏ qua: chính người thực hiện, người đã bị gỡ khỏi thẻ ngay sau đó, không còn là thành viên, thẻ đã xoá/không còn", async () => {
    const { handler, sent, base, tasks, task, assignee, creator, directory } = await setup();
    const evt = (ids: string[]): TaskEventPayload => ({ event: TASK_EVENTS.ASSIGNED, ...base, actorId: creator, assigneeIds: ids });

    await handler.handle(evt([creator]), "j1"); // tự giao
    await handler.handle(evt([newObjectId()]), "j2"); // không còn là người làm
    directory.members.delete(assignee);
    await handler.handle(evt([assignee]), "j3"); // rời nhóm
    expect(sent).toHaveLength(0);

    directory.members.add(assignee);
    Object.assign(tasks.tasks.get(task.id)!, { deletedAt: new Date() });
    await handler.handle(evt([assignee]), "j4");
    expect(sent).toHaveLength(0);
  });
});

describe("TaskNotificationHandler — bình luận", () => {
  const created = (s: Awaited<ReturnType<typeof setup>>, mentionIds: string[]): TaskEventPayload => ({
    event: TASK_EVENTS.COMMENT_CREATED, ...s.base, actorId: s.author, commentId: s.comment.id, mentionIds,
    assigneeIds: [s.assignee], createdBy: s.creator,
  });

  it("mention + người làm trùng một người → chỉ MỘT thông báo (MENTION thắng); người làm/người tạo còn lại nhận TASK_COMMENT; tác giả không nhận", async () => {
    const s = await setup();
    await s.handler.handle(created(s, [s.assignee, s.mentioned, s.author]), "task.comment-created_comment_1");

    const mention = s.sent.find((i) => i.type === "task.comment-mention")!;
    const watch = s.sent.find((i) => i.type === "task.comment")!;
    expect(mention.recipients).toEqual([
      { userId: s.assignee, kind: "TASK_COMMENT_MENTION" }, { userId: s.mentioned, kind: "TASK_COMMENT_MENTION" },
    ]);
    expect(watch.recipients).toEqual([{ userId: s.creator, kind: "TASK_COMMENT" }]); // người làm đã được nhắc → không nhận thêm
    const everyone = s.sent.flatMap((i) => i.recipients.map((r) => r.userId));
    expect(everyone).not.toContain(s.author);
    expect(new Set(everyone).size).toBe(everyone.length); // mỗi người ĐÚNG một thông báo
    // Hai nhóm dùng CHUNG source.id (comment:<id>) — engine hợp nhất theo (người nhận, commentId) nếu sau này có chồng chéo.
    expect(mention.source).toEqual({ type: "TASK_COMMENT", id: `comment:${s.comment.id}` });
    expect(watch.source).toEqual(mention.source);
    expect(JSON.stringify(s.sent)).not.toContain("Nội dung"); // refs không chứa nội dung bình luận
  });

  it("không có mention: chỉ TASK_COMMENT cho (người làm ∪ người tạo) \\ tác giả; người ngoài nhóm bị lọc; retry không gửi lại", async () => {
    const s = await setup();
    s.directory.members.delete(s.creator);
    const evt = created(s, [s.outsider]);
    await s.handler.handle(evt, "job-c1");
    await s.handler.handle(evt, "job-c1");

    expect(s.sent).toHaveLength(1);
    expect(s.sent[0]).toMatchObject({ type: "task.comment", recipients: [{ userId: s.assignee, kind: "TASK_COMMENT" }] });
  });

  it("bình luận/thẻ đã xoá trước khi job chạy → không gửi", async () => {
    const s = await setup();
    Object.assign(s.comments.comments.get(s.comment.id)!, { deletedAt: new Date() });
    await s.handler.handle(created(s, [s.mentioned]), "job-c2");
    expect(s.sent).toHaveLength(0);
  });

  it("sửa bình luận: chỉ người MỚI được nhắc nhận TASK_COMMENT_MENTION, source.id theo phiên bản (không hợp nhất với lần đầu)", async () => {
    const s = await setup();
    const evt: TaskEventPayload = { event: TASK_EVENTS.COMMENT_UPDATED, ...s.base, actorId: s.author, commentId: s.comment.id, commentVersion: 2, mentionIds: [s.mentioned] };
    await s.handler.handle(evt, "job-u1");
    await s.handler.handle(evt, "job-u1");

    expect(s.sent).toHaveLength(1);
    expect(s.sent[0]).toMatchObject({
      type: "task.comment-mention", recipients: [{ userId: s.mentioned, kind: "TASK_COMMENT_MENTION" }],
      source: { type: "TASK_COMMENT", id: `comment:${s.comment.id}:v2` },
    });
  });

  it("sự kiện không liên quan (task.created/…) bị bỏ qua, không lỗi", async () => {
    const s = await setup();
    await s.handler.handle({ event: TASK_EVENTS.CREATED, ...s.base } as unknown as TaskEventPayload, "x");
    expect(s.sent).toHaveLength(0);
  });
});
