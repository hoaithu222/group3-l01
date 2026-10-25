import { LIMITS } from "../../../core/constants/limits";
import { newObjectId } from "../../../core/utils/object-id";
import type { AuthUser } from "../../../core/types/express";
import type { NotifyInput } from "../../notifications/public";
import type { Board } from "../entities/board.interface";
import type { Task } from "../entities/task.interface";
import { TASK_EVENTS, type TaskEventPayload } from "../events/project-events";
import { InMemoryProjectDirectory } from "../repositories/project-support.inmemory";
import { InMemoryTaskCommentRepository } from "../repositories/task-comment.repository.inmemory";
import { InMemoryTaskWatcherRepository } from "../repositories/task-watcher.repository.inmemory";
import { InMemoryTaskRepository } from "../repositories/task.repository.inmemory";
import { TaskDueReminderService, type IReminderQueue } from "../services/task-due-reminder";
import { TaskNotificationHandler } from "../services/task-notification.handler";
import { isWatching, withWatchers } from "../services/task-watch-policy";
import { TaskWatchService } from "../services/task-watch.service";
import { ServiceHarness } from "./support/service-harness";

describe("task-watch-policy — hàm thuần", () => {
  const [a, b, c, d] = ["a", "b", "c", "d"];
  it("withWatchers: mặc định ∪ đang theo dõi (EXPLICIT_ON/AUTO_ON) \\ đã tắt (EXPLICIT_OFF); không trùng, giữ thứ tự", () => {
    expect(withWatchers([a, b], [])).toEqual([a, b]);
    expect(withWatchers([a, b], [{ userId: c, state: "EXPLICIT_ON" }, { userId: d, state: "AUTO_ON" }])).toEqual([a, b, c, d]);
    expect(withWatchers([a, b], [{ userId: b, state: "EXPLICIT_OFF" }])).toEqual([a]);
    expect(withWatchers([a], [{ userId: a, state: "EXPLICIT_ON" }, { userId: c, state: "EXPLICIT_OFF" }])).toEqual([a]);
  });

  it("isWatching: có hàng ⇒ theo hàng; không hàng ⇒ chỉ khi là người làm/người tạo", () => {
    expect(isWatching(a, [a], null)).toBe(true);
    expect(isWatching(c, [a], undefined)).toBe(false);
    expect(isWatching(a, [a], { userId: a, state: "EXPLICIT_OFF" })).toBe(false);
    expect(isWatching(c, [a], { userId: c, state: "AUTO_ON" })).toBe(true);
    expect(isWatching(c, [a], { userId: c, state: "EXPLICIT_ON" })).toBe(true);
  });
});

describe("TaskWatchService — PUT/DELETE watch, danh sách người theo dõi", () => {
  let h: ServiceHarness;
  let repo: InMemoryTaskWatcherRepository;
  let service: TaskWatchService;
  let owner: AuthUser;
  let creator: AuthUser;
  let assignee: AuthUser;
  let other: AuthUser;
  let guest: AuthUser;
  let board: Board;
  let task: Task;

  beforeEach(async () => {
    h = new ServiceHarness();
    repo = new InMemoryTaskWatcherRepository();
    service = new TaskWatchService({ access: h.access, directory: h.directory, watchers: repo });
    owner = h.addUser("OWNER");
    creator = h.addUser("MEMBER");
    assignee = h.addUser("MEMBER");
    other = h.addUser("MEMBER");
    guest = h.addUser("GUEST");
    board = await h.createBoard(owner);
    const t = await h.addTask(creator, board, "Thẻ theo dõi");
    h.setTask(t.id, { assigneeIds: [assignee.id] });
    task = (await h.tasks.findById(t.id)) as Task;
  });

  it("chưa chọn: người làm/người tạo đang theo dõi NGẦM ĐỊNH (state null); người khác không", async () => {
    const asAssignee = await service.list(assignee, task.id);
    expect(asAssignee.me).toEqual({ watching: true, state: null });
    expect((await service.list(other, task.id)).me).toEqual({ watching: false, state: null });
    expect(asAssignee.watchers.map((w) => [w.user.id, w.state]).sort()).toEqual([[assignee.id, "IMPLICIT"], [creator.id, "IMPLICIT"]].sort());
    expect(asAssignee.total).toBe(2);
  });

  it("PUT watch → EXPLICIT_ON (idempotent), có mặt trong danh sách trước người ngầm định; DELETE → EXPLICIT_OFF, biến mất khỏi danh sách (kể cả người làm)", async () => {
    expect(await service.watch(other, task.id)).toEqual({ watching: true, state: "EXPLICIT_ON" });
    expect(await service.watch(other, task.id)).toEqual({ watching: true, state: "EXPLICIT_ON" });
    expect(repo.rows.size).toBe(1);
    const list = await service.list(creator, task.id);
    expect(list.watchers[0]).toMatchObject({ user: { id: other.id }, state: "EXPLICIT_ON" });
    expect(list.total).toBe(3);

    expect(await service.unwatch(assignee, task.id)).toEqual({ watching: false, state: "EXPLICIT_OFF" });
    expect(await service.unwatch(assignee, task.id)).toEqual({ watching: false, state: "EXPLICIT_OFF" });
    const after = await service.list(other, task.id);
    expect(after.watchers.map((w) => w.user.id)).not.toContain(assignee.id);
    expect((await service.list(assignee, task.id)).me).toEqual({ watching: false, state: "EXPLICIT_OFF" });
    // Bật lại ghi đè EXPLICIT_OFF.
    expect(await service.watch(assignee, task.id)).toEqual({ watching: true, state: "EXPLICIT_ON" });
  });

  it("chỉ thành viên ACTIVE MEMBER+ hiện tại có mặt trong danh sách (người đã rời nhóm bị ẩn); AUTO_ON hiển thị đúng", async () => {
    await repo.ensureAuto(task.id, [other.id]);
    expect((await service.list(owner, task.id)).watchers.find((w) => w.user.id === other.id)?.state).toBe("AUTO_ON");
    h.directory.members.delete(other.id);
    h.directory.members.delete(creator.id);
    const list = await service.list(owner, task.id);
    expect(list.watchers.map((w) => w.user.id)).toEqual([assignee.id]);
  });

  it("quyền: GUEST/người ngoài → 404; thẻ đã xoá/không có → 404; ai đọc được bảng đều theo dõi được, kể cả bảng lưu trữ", async () => {
    await expect(service.watch(guest, task.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.list(guest, task.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.unwatch(other, newObjectId())).rejects.toMatchObject({ statusCode: 404 });
    h.boards.boards.get(board.id)!.archivedAt = new Date();
    expect(await service.watch(other, task.id)).toMatchObject({ watching: true });
    h.setTask(task.id, { deletedAt: new Date() });
    await expect(service.watch(other, task.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("ensureAuto không bao giờ ghi đè lựa chọn của người dùng; danh sách bị chặn bởi LIMITS.task.watchersListMax", async () => {
    await service.unwatch(other, task.id);
    expect(await repo.ensureAuto(task.id, [other.id, creator.id])).toBe(1); // chỉ creator mới
    expect(repo.rows.get(`${task.id}:${other.id}`)?.state).toBe("EXPLICIT_OFF");
    expect(await repo.ensureAuto(task.id, [creator.id])).toBe(0);
    expect((await repo.listByTask(task.id, 1))).toHaveLength(1);
    expect(LIMITS.task.watchersListMax).toBeGreaterThan(0);
  });
});

/** Nối vào thông báo: TASK_COMMENT + TASK_DUE_SOON cho người theo dõi, trừ người đã tắt; AUTO_ON khi được giao/bình luận/được nhắc. */
describe("Thông báo tôn trọng người theo dõi (p3-03 P1)", () => {
  async function setup() {
    const tasks = new InMemoryTaskRepository();
    const comments = new InMemoryTaskCommentRepository();
    const directory = new InMemoryProjectDirectory();
    const watchers = new InMemoryTaskWatcherRepository();
    const sent: NotifyInput[] = [];
    const notify = async (input: NotifyInput): Promise<void> => {
      sent.push(input);
      directory.notifications.add(input.dedupeKey);
    };
    const handler = new TaskNotificationHandler({ tasks, comments, directory, notify, watchers });
    const [creator, assignee, author, mentioned, follower, muted] = [1, 2, 3, 4, 5, 6].map(() => newObjectId());
    for (const id of [creator, assignee, author, mentioned, follower, muted]) directory.members.add(id);
    const task = await tasks.create({
      boardId: newObjectId(), workspaceId: newObjectId(), columnId: "c_aaaaaaaa", columnKind: "TODO", position: "a0", title: "Thẻ chung",
      normalizedTitle: "the chung", assigneeIds: [assignee, muted], labelIds: [], dueDate: null, dueVersion: 0, completedAt: null, completionCount: 0,
      createdBy: creator, clientTaskId: null,
    });
    const comment = await comments.create({ id: newObjectId(), taskId: task.id, boardId: task.boardId, workspaceId: task.workspaceId, authorId: author, clientCommentId: "client-comment-1", content: "Nội dung", mentions: [], attachmentCount: 0 });
    const base = { taskId: task.id, boardId: task.boardId, workspaceId: task.workspaceId };
    return { tasks, directory, watchers, sent, handler, task, comment, base, creator, assignee, author, mentioned, follower, muted, notify };
  }

  it("bình luận: người theo dõi (EXPLICIT_ON/AUTO_ON) nhận TASK_COMMENT cùng người làm/người tạo; người tắt (kể cả người làm) KHÔNG; tác giả và người được nhắc không nhận bản TASK_COMMENT", async () => {
    const s = await setup();
    await s.watchers.setExplicit(s.task.id, s.follower, "EXPLICIT_ON");
    await s.watchers.setExplicit(s.task.id, s.muted, "EXPLICIT_OFF");
    await s.watchers.ensureAuto(s.task.id, [s.mentioned]);
    const evt: TaskEventPayload = { event: TASK_EVENTS.COMMENT_CREATED, ...s.base, actorId: s.author, commentId: s.comment.id, mentionIds: [s.mentioned], assigneeIds: [s.assignee, s.muted], createdBy: s.creator };

    await s.handler.handle(evt, "task.comment-created_c1");

    const byType = (type: string) => s.sent.filter((x) => x.type === type).flatMap((x) => x.recipients.map((r) => r.userId)).sort();
    expect(byType("task.comment-mention")).toEqual([s.mentioned]);
    expect(byType("task.comment")).toEqual([s.assignee, s.creator, s.follower].sort());
    expect(byType("task.comment")).not.toContain(s.muted);
    expect(byType("task.comment")).not.toContain(s.author);
    expect(byType("task.comment")).not.toContain(s.mentioned); // MENTION thắng — một người một thông báo
  });

  it("AUTO_ON: tác giả bình luận + người được nhắc tự theo dõi; người được giao tự theo dõi; KHÔNG ghi đè EXPLICIT_OFF; chạy lại vô hại", async () => {
    const s = await setup();
    await s.watchers.setExplicit(s.task.id, s.muted, "EXPLICIT_OFF");
    const evt: TaskEventPayload = { event: TASK_EVENTS.COMMENT_CREATED, ...s.base, actorId: s.author, commentId: s.comment.id, mentionIds: [s.mentioned], assigneeIds: [s.assignee], createdBy: s.creator };
    await s.handler.handle(evt, "task.comment-created_c1");
    await s.handler.handle(evt, "task.comment-created_c1"); // BullMQ retry
    expect(s.watchers.rows.get(`${s.task.id}:${s.author}`)?.state).toBe("AUTO_ON");
    expect(s.watchers.rows.get(`${s.task.id}:${s.mentioned}`)?.state).toBe("AUTO_ON");

    await s.handler.handle({ event: TASK_EVENTS.ASSIGNED, ...s.base, actorId: s.creator, assigneeIds: [s.assignee, s.muted] }, "task.assigned_x_v2");
    expect(s.watchers.rows.get(`${s.task.id}:${s.assignee}`)?.state).toBe("AUTO_ON");
    expect(s.watchers.rows.get(`${s.task.id}:${s.muted}`)?.state).toBe("EXPLICIT_OFF"); // giữ nguyên lựa chọn
    expect(s.sent.filter((x) => x.type === "task.assigned").flatMap((x) => x.recipients.map((r) => r.userId)).sort()).toEqual([s.assignee, s.muted].sort()); // thông báo được giao KHÔNG bị ảnh hưởng
  });

  it("lỗi ghi theo dõi tự động không làm hỏng thông báo", async () => {
    const s = await setup();
    jest.spyOn(s.watchers, "ensureAuto").mockRejectedValue(new Error("DB lỗi"));
    await expect(s.handler.handle({ event: TASK_EVENTS.ASSIGNED, ...s.base, actorId: s.creator, assigneeIds: [s.assignee] }, "task.assigned_y_v1")).resolves.toBeUndefined();
    expect(s.sent).toHaveLength(1);
  });

  it("không có kho theo dõi (bản P0) → hành vi cũ: người làm ∪ người tạo trừ tác giả", async () => {
    const s = await setup();
    const comments = new InMemoryTaskCommentRepository();
    const c = await comments.create({ id: newObjectId(), taskId: s.task.id, boardId: s.task.boardId, workspaceId: s.task.workspaceId, authorId: s.author, clientCommentId: "client-comment-2", content: "x", mentions: [], attachmentCount: 0 });
    const withComments = new TaskNotificationHandler({ tasks: s.tasks, comments, directory: s.directory, notify: s.notify });
    await withComments.handle({ event: TASK_EVENTS.COMMENT_CREATED, ...s.base, actorId: s.author, commentId: c.id, mentionIds: [], assigneeIds: [s.assignee], createdBy: s.creator }, "task.comment-created_c2");
    expect(s.sent.flatMap((x) => x.recipients.map((r) => r.userId)).sort()).toEqual([s.assignee, s.creator].sort());
  });

  describe("nhắc hạn", () => {
    const NOW = new Date("2026-09-21T08:00:00.000Z");
    const noopQueue: IReminderQueue = { schedule: async () => undefined, cancel: async () => undefined };

    it("TASK_DUE_SOON gửi thêm cho người theo dõi và bớt người đã tắt; thẻ chưa giao ai → người tạo + người theo dõi", async () => {
      const s = await setup();
      const due = new Date(NOW.getTime() + 12 * 3_600_000);
      Object.assign(s.tasks.tasks.get(s.task.id)!, { dueDate: due, dueVersion: 1 });
      await s.watchers.setExplicit(s.task.id, s.follower, "EXPLICIT_ON");
      await s.watchers.setExplicit(s.task.id, s.muted, "EXPLICIT_OFF");
      const service = new TaskDueReminderService({ tasks: s.tasks, directory: s.directory, queue: noopQueue, notify: s.notify, watchers: s.watchers, now: () => NOW });

      expect(await service.process({ taskId: s.task.id, dueVersion: 1 })).toBe("sent");
      expect(s.sent[0].recipients.map((r) => r.userId).sort()).toEqual([s.assignee, s.follower].sort());

      // Thẻ không người làm: người tạo + người theo dõi.
      s.sent.length = 0;
      Object.assign(s.tasks.tasks.get(s.task.id)!, { assigneeIds: [], dueVersion: 2 });
      expect(await service.process({ taskId: s.task.id, dueVersion: 2 })).toBe("sent");
      expect(s.sent[0].recipients.map((r) => r.userId).sort()).toEqual([s.creator, s.follower].sort());
    });
  });
});
