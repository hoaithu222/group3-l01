import { installMocks, redisStore } from "./projects-test-mocks";
import { buildProjectsApp, cleanupGroups, ensureProjectIndexes, makeApi, seedGroup, tokenFor, type Group } from "./projects-test-kit";
import { newObjectId } from "../../../../core/utils/object-id";
import { prisma } from "../../../../infrastructure/database";

const app = buildProjectsApp();
const api = makeApi(app);

type Board = { id: string; columns: { id: string; kind: string }[] };
type Detail = {
  id: string; title: string; version: number; description: string | null; startDate: string | null; dueDate: string | null; checklist: { id: string; text: string; done: boolean }[];
  checklistDone: number; checklistTotal: number; attachmentCount: number; commentCount: number; columnId: string; deletedAt: string | null;
  assignees: { id: string; name: string }[]; labels: { id: string; name: string }[];
  myPermissions: { edit: boolean; delete: boolean; comment: boolean; attach: boolean; restore: boolean };
};

describe("projects p3-03 — chi tiết thẻ, bình luận, đính kèm (integration, Mongo memory replset)", () => {
  const groups: Group[] = [];
  let g: Group;
  let board: Board;
  let task: Detail;

  beforeAll(() => ensureProjectIndexes());
  beforeEach(async () => {
    installMocks();
    g = await seedGroup({ A: "OWNER", B: "ADMIN", C: "MEMBER", D: "MEMBER", G: "GUEST" });
    groups.push(g);
    board = (await api("post", `/workspaces/${g.workspaceId}/boards`, tokenFor(g.ids.A), { name: "Đồ án" })).body.data;
    const created = await api("post", `/boards/${board.id}/tasks`, tokenFor(g.ids.C), { title: "Viết báo cáo" });
    expect(created.status).toBe(201);
    task = (await api("get", `/tasks/${created.body.data.id}`, tokenFor(g.ids.C))).body.data;
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
  const patch = (who: string, body: Record<string, unknown>, id = task.id) => api("patch", `/tasks/${id}`, as(who), body);
  const mark = (who: string) => `@{u:${g.ids[who]}}`;
  let seq = 0;
  const comment = (who: string, content: string, extra: Record<string, unknown> = {}) =>
    api("post", `/tasks/${task.id}/comments`, as(who), { clientCommentId: `client-comment-${++seq}-${g.workspaceId.slice(-4)}`, content, ...extra });

  describe("GET /tasks/:id", () => {
    it("200 đủ TaskDetailDto + myPermissions; GUEST/người ngoài/không tồn tại → 404 trung tính", async () => {
      const res = await api("get", `/tasks/${task.id}`, as("D"));
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id: task.id, title: "Viết báo cáo", description: null, startDate: null, dueDate: null, checklist: [], labels: [], deletedAt: null,
        createdBy: g.ids.C, myPermissions: { edit: true, delete: false, comment: true, attach: true, restore: false },
      });
      expect((await api("get", `/tasks/${task.id}`, as("B"))).body.data.myPermissions.delete).toBe(true);

      for (const who of ["G"]) expect((await api("get", `/tasks/${task.id}`, as(who))).status).toBe(404);
      expect((await api("get", `/tasks/${task.id}`, tokenFor(newObjectId()))).status).toBe(404);
      expect((await api("get", `/tasks/${newObjectId()}`, as("C"))).status).toBe(404);
      expect((await api("get", `/tasks/khong-phai-id`, as("C"))).status).toBe(400);
    });
  });

  describe("PATCH /tasks/:id", () => {
    it("PM2-15: đổi tiêu đề + hạn + người làm trong 1 request → 3 activity + outbox due-changed & assigned (một lần)", async () => {
      const due = new Date(Date.now() + 3 * 86_400_000).toISOString();
      const res = await patch("D", { title: "Tên mới", dueDate: due, assigneeIds: [g.ids.C], expectedVersion: task.version });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ title: "Tên mới", dueDate: due, version: task.version + 1 });
      expect(res.body.data.assignees.map((a: { id: string }) => a.id)).toEqual([g.ids.C]);
      const acts = (await prisma.taskActivity.findMany({ where: { taskId: task.id }, orderBy: [{ at: "asc" }, { id: "asc" }] })).filter((a) => a.type !== "CREATED");
      expect(acts.map((a) => a.type).sort()).toEqual(["ASSIGNED", "DUE_CHANGED", "RENAMED"]);
      expect(acts.every((a) => a.actorId === g.ids.D)).toBe(true);

      const events = await prisma.outboxEvent.findMany({ where: { aggregateId: task.id }, orderBy: { createdAt: "asc" } });
      const byType = (t: string) => events.filter((e) => e.type === t);
      expect(byType("task.due-changed").map((e) => e.dedupeKey)).toEqual([`task.due-changed:task:${task.id}:d1`]);
      expect(byType("task.assigned").map((e) => e.dedupeKey)).toEqual([`task.assigned:task:${task.id}:v${task.version + 1}`]);
      expect((await prisma.task.findUnique({ where: { id: task.id } }))?.dueVersion).toBe(1);
    });

    it("lệch expectedVersion → 409 RES_003 {currentVersion}; hai PATCH SONG SONG cùng version → đúng một thắng (CAS)", async () => {
      const ok = await patch("C", { title: "Lần 1", expectedVersion: task.version });
      expect(ok.status).toBe(200);
      const stale = await patch("D", { title: "Lần 2", expectedVersion: task.version });
      expect([stale.status, stale.body.error.code, stale.body.error.details.currentVersion]).toEqual([409, "RES_003", task.version + 1]);

      const v = ok.body.data.version;
      const [r1, r2] = await Promise.all([patch("C", { title: "Song song 1", expectedVersion: v }), patch("D", { title: "Song song 2", expectedVersion: v })]);
      expect([r1.status, r2.status].sort()).toEqual([200, 409]);
      const winner = r1.status === 200 ? "Song song 1" : "Song song 2";
      expect((await prisma.task.findUnique({ where: { id: task.id } }))).toMatchObject({ title: winner, version: v + 1 });
    });

    it("VAL: người làm GUEST/người ngoài + nhãn bảng khác → 400 kèm id sai; TASK_013; body sai (thiếu version, tiêu đề rỗng, điểm âm, ngày lạ) → 400", async () => {
      const stranger = newObjectId();
      const foreignLabel = newObjectId();
      const bad = await patch("C", { assigneeIds: [g.ids.G, stranger], labelIds: [foreignLabel], expectedVersion: task.version });
      expect([bad.status, bad.body.error.code]).toEqual([400, "VAL_001"]);
      expect(bad.body.error.details).toEqual({ invalidAssigneeIds: [g.ids.G, stranger], invalidLabelIds: [foreignLabel] });

      const dates = await patch("C", { startDate: "2026-10-11T00:00:00.000Z", dueDate: "2026-10-10T00:00:00.000Z", expectedVersion: task.version });
      expect([dates.status, dates.body.error.code]).toEqual([400, "TASK_013"]);

      for (const body of [{ title: "x" }, { title: "", expectedVersion: 1 }, { storyPoints: -1, expectedVersion: 1 }, { storyPoints: 101, expectedVersion: 1 }, { dueDate: "không-phải-ngày", expectedVersion: 1 }, { assigneeIds: ["abc"], expectedVersion: 1 }, { description: "x".repeat(20_001), expectedVersion: 1 }]) {
        expect([JSON.stringify(body).slice(0, 40), (await patch("C", body)).status]).toEqual([JSON.stringify(body).slice(0, 40), 400]);
      }
      expect((await prisma.task.findUnique({ where: { id: task.id } }))?.version).toBe(task.version);
    });

    it("mô tả markdown có `<`/code được lưu nguyên; xoá mô tả (null); điểm 0 và nhãn hợp lệ; GUEST 404", async () => {
      const label = (await api("post", `/boards/${board.id}/labels`, as("C"), { name: "ReactJS", color: "blue" })).body.data;
      const md = "# Mục tiêu\n```ts\nif (a < b && c > d) { run(); }\n```\n- [ ] việc";
      const res = await patch("C", { description: md, storyPoints: 0, labelIds: [label.id], startDate: "2026-09-01T00:00:00.000Z", expectedVersion: task.version });
      expect(res.body.data).toMatchObject({ description: md, storyPoints: 0, startDate: "2026-09-01T00:00:00.000Z" });
      expect(res.body.data.labels.map((l: { name: string }) => l.name)).toEqual(["ReactJS"]);
      const desc = await prisma.taskActivity.findFirst({ where: { taskId: task.id, type: "DESCRIPTION" } });
      expect(JSON.stringify(desc)).not.toContain("run()");

      const cleared = await patch("C", { description: null, expectedVersion: res.body.data.version });
      expect(cleared.body.data.description).toBeNull();
      expect((await patch("G", { title: "x", expectedVersion: 1 })).status).toBe(404);
    });
  });

  describe("DELETE /tasks/:id · POST /tasks/:id/restore", () => {
    it("PM2-17: xoá mềm rồi khôi phục → về CUỐI cột cũ; người khác 404; activity còn nguyên; outbox deleted/restored", async () => {
      const b = (await api("post", `/boards/${board.id}/tasks`, as("C"), { title: "Thẻ B" })).body.data;
      const c = (await api("post", `/boards/${board.id}/tasks`, as("C"), { title: "Thẻ C" })).body.data;

      expect((await api("delete", `/tasks/${task.id}`, as("D"))).status).toBe(403); // MEMBER khác
      expect((await api("delete", `/tasks/${task.id}`, as("G"))).status).toBe(404);
      const del = await api("delete", `/tasks/${task.id}`, as("C"));
      expect(del.status).toBe(204);
      expect(await prisma.task.findUnique({ where: { id: task.id } })).toMatchObject({ deletedBy: g.ids.C, deletedFromColumnId: task.columnId });

      const list = await api("get", `/boards/${board.id}/tasks`, as("D"));
      expect(list.body.data.columns.flatMap((x: { tasks: { id: string }[] }) => x.tasks.map((t) => t.id))).not.toContain(task.id);
      expect((await api("get", `/tasks/${task.id}`, as("C"))).status).toBe(404);
      expect((await api("get", `/tasks/${task.id}?includeDeleted=true`, as("D"))).status).toBe(404);
      const deleted = await api("get", `/tasks/${task.id}?includeDeleted=true`, as("C"));
      expect(deleted.body.data).toMatchObject({ deletedAt: expect.any(String), myPermissions: { restore: true, edit: false } });
      expect((await api("post", `/tasks/${task.id}/restore`, as("D"))).status).toBe(404);

      const restored = await api("post", `/tasks/${task.id}/restore`, as("C"));
      expect(restored.status).toBe(200);
      expect(restored.body.data).toMatchObject({ id: task.id, columnId: task.columnId });
      const after = await api("get", `/boards/${board.id}/tasks?columnId=${task.columnId}`, as("D"));
      expect(after.body.data.columns[0].tasks.map((t: { id: string }) => t.id)).toEqual([b.id, c.id, task.id]);

      const feed = await api("get", `/tasks/${task.id}/activity`, as("D"));
      expect(feed.body.data.map((a: { type: string }) => a.type)).toEqual(["RESTORED", "DELETED", "CREATED"]);
      const types = (await prisma.outboxEvent.findMany({ where: { aggregateId: task.id } })).map((e) => e.type);
      expect(types).toEqual(expect.arrayContaining(["task.deleted", "task.restored"]));
    });

    it("ADMIN xoá/khôi phục thẻ của người khác; quá 30 ngày → 410 TASK_016; khôi phục lại lần hai idempotent", async () => {
      expect((await api("delete", `/tasks/${task.id}`, as("B"))).status).toBe(204);
      expect((await api("post", `/tasks/${task.id}/restore`, as("B"))).status).toBe(200);
      const again = await api("post", `/tasks/${task.id}/restore`, as("B"));
      expect([again.status, again.body.data.id]).toEqual([200, task.id]);

      await api("delete", `/tasks/${task.id}`, as("C"));
      await prisma.task.update({ where: { id: task.id }, data: { deletedAt: new Date(Date.now() - 31 * 86_400_000) } });
      const old = await api("post", `/tasks/${task.id}/restore`, as("A"));
      expect([old.status, old.body.error.code]).toEqual([410, "TASK_016"]);
    });

    it("khôi phục khi cột cũ đã bị xoá → cột TODO đầu tiên; bảng đã lưu trữ → 403", async () => {
      const inProgress = col("IN_PROGRESS");
      await api("post", `/tasks/${task.id}/move`, as("C"), { columnId: inProgress, afterTaskId: null, beforeTaskId: null, expectedVersion: task.version, clientMutationId: "mutation-abc-0001" });
      await api("delete", `/tasks/${task.id}`, as("C"));

      const current = (await api("get", `/boards/${board.id}`, as("A"))).body.data;
      const put = await api("put", `/boards/${board.id}/columns`, as("A"), {
        columns: current.columns.filter((c: { id: string }) => c.id !== inProgress).map((c: { id: string; title: string; kind: string }) => ({ id: c.id, title: c.title, kind: c.kind })),
        expectedVersion: current.version,
      });
      expect(put.status).toBe(200);
      const restored = await api("post", `/tasks/${task.id}/restore`, as("C"));
      expect([restored.status, restored.body.data.columnId]).toEqual([200, col("TODO")]);

      await api("delete", `/tasks/${task.id}`, as("C"));
      await api("post", `/boards/${board.id}/archive`, as("A"));
      expect((await api("post", `/tasks/${task.id}/restore`, as("C"))).status).toBe(403);
    });
  });

  describe("bình luận", () => {
    it("tạo 201 → gửi lại cùng clientCommentId 200 (bản cũ, không nhân đôi); commentCount +1; outbox comment-created; danh sách mới → cũ có tên tác giả", async () => {
      const id = `client-comment-fixed-${g.workspaceId.slice(-6)}`;
      const first = await comment("D", `Chào ${mark("C")}`, { clientCommentId: id, mentions: [{ type: "USER", targetId: g.ids.C }] });
      const second = await comment("D", "nội dung khác", { clientCommentId: id });
      expect([first.status, second.status]).toEqual([201, 200]);
      expect(second.body.data.id).toBe(first.body.data.id);
      expect(first.body.data).toMatchObject({ content: `Chào ${mark("C")}`, version: 1, author: { id: g.ids.D, name: "Người D" }, mentions: [{ type: "USER", targetId: g.ids.C, label: "Người C" }] });
      expect(await prisma.taskComment.count({ where: { taskId: task.id } })).toBe(1);

      const stored = await prisma.task.findUnique({ where: { id: task.id } });
      expect(stored).toMatchObject({ commentCount: 1, version: task.version }); // bình luận KHÔNG tăng version
      const evt = await prisma.outboxEvent.findMany({ where: { aggregateId: task.id, type: "task.comment-created" } });
      expect(evt).toHaveLength(1);
      expect(evt[0].dedupeKey).toBe(`task.comment-created:comment:${first.body.data.id}`);
      expect(evt[0].payload).toMatchObject({ commentId: first.body.data.id, actorId: g.ids.D, mentionIds: [g.ids.C], createdBy: g.ids.C });

      await comment("C", "Trả lời");
      const list = await api("get", `/tasks/${task.id}/comments?limit=1`, as("B"));
      expect(list.status).toBe(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0]).toMatchObject({ content: "Trả lời", author: { id: g.ids.C } });
      expect(list.body.meta).toMatchObject({ hasMore: true, limit: 1 });
      const next = await api("get", `/tasks/${task.id}/comments?limit=1&cursor=${list.body.meta.nextCursor}`, as("B"));
      expect(next.body.data.map((c: { id: string }) => c.id)).toEqual([first.body.data.id]);
    });

    it("gửi lại đồng thời cùng clientCommentId (đua P2002): chỉ MỘT bình luận được tạo, người còn lại nhận bản cũ", async () => {
      const id = `client-comment-race-${g.workspaceId.slice(-6)}`;
      const results = await Promise.all([1, 2, 3].map(() => comment("D", "Gửi song song", { clientCommentId: id })));
      expect(results.map((r) => r.status).sort()).toEqual([200, 200, 201]);
      expect(new Set(results.map((r) => r.body.data.id)).size).toBe(1);
      expect(await prisma.taskComment.count({ where: { taskId: task.id } })).toBe(1);
      expect((await prisma.task.findUnique({ where: { id: task.id } }))?.commentCount).toBe(1);
      expect(await prisma.outboxEvent.count({ where: { aggregateId: task.id, type: "task.comment-created" } })).toBe(1);
    });

    it("PM2-16: nhắc người ngoài workspace / GUEST → 400 TASK_014 {invalidMentions}; không tạo gì", async () => {
      const stranger = newObjectId();
      const res = await comment("C", `${mark("D")} ${mark("G")} @{u:${stranger}}`, {
        mentions: [{ type: "USER", targetId: g.ids.D }, { type: "USER", targetId: g.ids.G }, { type: "USER", targetId: stranger }],
      });
      expect([res.status, res.body.error.code]).toEqual([400, "TASK_014"]);
      expect(res.body.error.details).toEqual({ invalidMentions: [g.ids.G, stranger] });
      expect(await prisma.taskComment.count({ where: { taskId: task.id } })).toBe(0);
      expect((await comment("C", "marker không khớp", { mentions: [{ type: "USER", targetId: g.ids.D }] })).body.error.code).toBe("VAL_001");
    });

    it("DTO: nội dung rỗng không tệp / quá 4000 ký tự / thiếu clientCommentId → 400; GUEST 404; giới hạn 10 bình luận/phút/người/thẻ → 429", async () => {
      expect((await comment("C", "   ")).status).toBe(400);
      expect((await comment("C", "x".repeat(4001))).status).toBe(400);
      expect((await api("post", `/tasks/${task.id}/comments`, as("C"), { content: "không id" })).status).toBe(400);
      expect((await comment("G", "khách")).status).toBe(404);

      // Cửa sổ cố định 60 s: nếu ranh giới phút rơi giữa chừng thì bộ đếm reset một lần → gửi dư để chắc chắn gặp 429.
      const statuses: number[] = [];
      for (let i = 0; i < 25 && !statuses.includes(429); i++) statuses.push((await comment("D", `nhanh ${i}`)).status);
      const firstLimited = statuses.indexOf(429);
      expect(firstLimited).toBeGreaterThanOrEqual(10);
      expect(firstLimited).toBeLessThanOrEqual(20);
      expect(statuses.slice(0, firstLimited).every((code) => code === 201)).toBe(true);
      // Người khác cùng thẻ có hạn mức riêng.
      expect((await comment("C", "vẫn gửi được")).status).toBe(201);
    });

    it("PM2-23: sửa bình luận trong 15 phút OK; sau 16 phút → 409 TASK_015; người khác 403; lệch version 409 RES_003; nội dung rỗng 400", async () => {
      const created = (await comment("D", "Bản gốc")).body.data;
      const edited = await api("patch", `/task-comments/${created.id}`, as("D"), { content: "Đã sửa", mentions: [], expectedVersion: 1 });
      expect(edited.status).toBe(200);
      expect(edited.body.data).toMatchObject({ content: "Đã sửa", version: 2, editedAt: expect.any(String) });

      expect((await api("patch", `/task-comments/${created.id}`, as("B"), { content: "x", mentions: [], expectedVersion: 2 })).status).toBe(403); // kể cả ADMIN
      const stale = await api("patch", `/task-comments/${created.id}`, as("D"), { content: "x", mentions: [], expectedVersion: 1 });
      expect([stale.status, stale.body.error.code]).toEqual([409, "RES_003"]);
      expect((await api("patch", `/task-comments/${created.id}`, as("D"), { content: "  ", mentions: [], expectedVersion: 2 })).status).toBe(400);

      await prisma.taskComment.update({ where: { id: created.id }, data: { createdAt: new Date(Date.now() - 16 * 60_000) } });
      const late = await api("patch", `/task-comments/${created.id}`, as("D"), { content: "Sửa muộn", mentions: [], expectedVersion: 2 });
      expect([late.status, late.body.error.code]).toEqual([409, "TASK_015"]);
      expect((await prisma.taskComment.findUnique({ where: { id: created.id } }))?.content).toBe("Đã sửa");
    });

    it("xoá: tác giả 204 (tombstone, count −1); ADMIN xoá của người khác cần lý do (thiếu → 400), ghi audit + activity; MEMBER xoá của người khác 403", async () => {
      const mine = (await comment("D", "Của D")).body.data;
      const theirs = (await comment("C", "Của C — vi phạm")).body.data;
      expect((await api("delete", `/task-comments/${theirs.id}`, as("D"), { reason: "Không đủ quyền để xoá" })).status).toBe(403);
      expect((await api("delete", `/task-comments/${theirs.id}`, as("G"))).status).toBe(404);

      expect((await api("delete", `/task-comments/${mine.id}`, as("D"))).status).toBe(204);
      const missing = await api("delete", `/task-comments/${theirs.id}`, as("B"));
      expect([missing.status, missing.body.error.code]).toEqual([400, "VAL_001"]);
      expect((await api("delete", `/task-comments/${theirs.id}`, as("B"), { reason: "ngắn" })).status).toBe(400); // < 10 ký tự
      const ok = await api("delete", `/task-comments/${theirs.id}`, as("B"), { reason: "Nội dung không phù hợp" });
      expect(ok.status).toBe(204);

      expect((await prisma.task.findUnique({ where: { id: task.id } }))?.commentCount).toBe(0);
      const audit = await prisma.auditLog.findFirst({ where: { workspaceId: g.workspaceId, action: "task-comment.remove" } });
      expect(audit).toMatchObject({ actorId: g.ids.B, targetType: "TaskComment", targetId: theirs.id, reason: "Nội dung không phù hợp" });
      expect(await prisma.taskActivity.count({ where: { taskId: task.id, type: "COMMENT_DELETED_BY_ADMIN" } })).toBe(1);

      const list = await api("get", `/tasks/${task.id}/comments`, as("C"));
      expect(list.body.data.map((c: { content: string; deletedAt: string | null }) => [c.content, c.deletedAt !== null])).toEqual([["", true], ["", true]]);
      expect((await api("delete", `/task-comments/${mine.id}`, as("D"))).status).toBe(404); // đã xoá
    });

    it("thông báo (engine thật): người được nhắc VỪA là người làm → MỘT thông báo MENTION; người tạo nhận TASK_COMMENT; tác giả không nhận; retry không nhân đôi", async () => {
      // Người tạo = C; người làm = B; D bình luận nhắc B → B (vừa làm vừa được nhắc) chỉ nhận MENTION; C nhận TASK_COMMENT; D (tác giả) không nhận.
      await patch("C", { assigneeIds: [g.ids.B], expectedVersion: task.version });
      const created = await comment("D", `${mark("B")} xem giúp`, { mentions: [{ type: "USER", targetId: g.ids.B }] });
      expect(created.status).toBe(201);

      const { getTaskNotificationHandler } = await import("../../jobs/task-detail-wiring");
      const evt = await prisma.outboxEvent.findFirstOrThrow({ where: { aggregateId: task.id, type: "task.comment-created" } });
      const jobId = evt.dedupeKey.replace(/:/g, "_");
      await getTaskNotificationHandler().handle(evt.payload as never, jobId);
      await getTaskNotificationHandler().handle(evt.payload as never, jobId); // BullMQ retry

      const rows = await prisma.notificationRecipient.findMany({ where: { workspaceId: g.workspaceId } });
      expect(rows.map((r) => `${r.recipientId}:${r.kind}`).sort()).toEqual([`${g.ids.B}:TASK_COMMENT_MENTION`, `${g.ids.C}:TASK_COMMENT`].sort());
      expect(rows.some((r) => r.recipientId === g.ids.D)).toBe(false);
      const notifications = await prisma.notification.findMany({ where: { workspaceId: g.workspaceId } });
      expect(notifications.map((n) => n.type).sort()).toEqual(["task.comment", "task.comment-mention"]);
      for (const n of notifications) {
        expect(n).toMatchObject({ scopeType: "WORKSPACE", scopeId: g.workspaceId, actorId: g.ids.D });
        expect(n.refs).toMatchObject({ taskId: task.id, taskTitle: "Viết báo cáo" });
        expect(JSON.stringify(n.refs)).not.toContain("xem giúp"); // không lộ nội dung bình luận
      }
    });
  });

  describe("GET /tasks/:id/activity · GET /boards/:id/mentionables", () => {
    it("activity: mới → cũ kèm actor + tên người được giao; phân trang cursor; GUEST 404", async () => {
      await patch("C", { title: "Tên khác", assigneeIds: [g.ids.D], expectedVersion: task.version });
      const all = await api("get", `/tasks/${task.id}/activity`, as("D"));
      expect(all.body.data.map((a: { type: string }) => a.type)).toEqual(expect.arrayContaining(["CREATED", "RENAMED", "ASSIGNED"]));
      const assigned = all.body.data.find((a: { type: string }) => a.type === "ASSIGNED");
      expect(assigned).toMatchObject({ actor: { id: g.ids.C, name: "Người C" }, after: { userId: g.ids.D, name: "Người D" } });

      const p1 = await api("get", `/tasks/${task.id}/activity?limit=2`, as("D"));
      const p2 = await api("get", `/tasks/${task.id}/activity?limit=2&cursor=${p1.body.meta.nextCursor}`, as("D"));
      expect([...p1.body.data, ...p2.body.data].map((a: { id: string }) => a.id)).toEqual(all.body.data.map((a: { id: string }) => a.id));
      expect((await api("get", `/tasks/${task.id}/activity`, as("G"))).status).toBe(404);
    });

    it("mentionables: thành viên MEMBER+ (không GUEST), lọc không dấu, không có email, ≤ 20; GUEST 404", async () => {
      const all = await api("get", `/boards/${board.id}/mentionables`, as("C"));
      expect(all.status).toBe(200);
      const ids = all.body.data.map((u: { id: string }) => u.id);
      expect(ids).toEqual(expect.arrayContaining([g.ids.A, g.ids.B, g.ids.C, g.ids.D]));
      expect(ids).not.toContain(g.ids.G);
      expect(Object.keys(all.body.data[0]).sort()).toEqual(["avatarUrl", "id", "name"]);

      const filtered = await api("get", `/boards/${board.id}/mentionables?q=nguoi d`, as("C"));
      expect(filtered.body.data.map((u: { id: string }) => u.id)).toEqual([g.ids.D]);
      expect((await api("get", `/boards/${board.id}/mentionables`, as("G"))).status).toBe(404);
    });
  });
});
