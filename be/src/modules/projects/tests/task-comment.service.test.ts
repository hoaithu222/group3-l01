// Unit-test redis mock mặc định (`setup.ts`) thiếu `incr/expire` mà `permissionService.bumpVersion` (archive) cần.
jest.mock("../../../infrastructure/redis", () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), incr: jest.fn(), expire: jest.fn(), ping: jest.fn() },
}));

import { AppError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { newObjectId } from "../../../core/utils/object-id";
import type { CreateCommentDto } from "../dtos";
import type { Board } from "../entities/board.interface";
import type { Task } from "../entities/task.interface";
import type { TaskCommentCreatedPayload, TaskCommentUpdatedPayload } from "../events/project-events";
import { ServiceHarness } from "./support/service-harness";

let h: ServiceHarness;
let owner: AuthUser;
let admin: AuthUser;
let member: AuthUser;
let lan: AuthUser;
let guest: AuthUser;
let board: Board;
let task: Task;

beforeEach(async () => {
  h = new ServiceHarness();
  owner = h.addUser("OWNER");
  admin = h.addUser("ADMIN");
  member = h.addUser("MEMBER");
  lan = h.addUser("MEMBER");
  guest = h.addUser("GUEST");
  board = await h.createBoard(owner);
  task = await h.addTask(member, board, "Thẻ bình luận");
});

const catchError = async (p: Promise<unknown>): Promise<AppError> => {
  try {
    await p;
  } catch (err) {
    return err as AppError;
  }
  throw new Error("Đáng lẽ phải ném lỗi");
};
const mark = (u: AuthUser) => `@{u:${u.id}}`;
let seq = 0;
const send = (user: AuthUser, content: string, extra: Partial<CreateCommentDto> = {}) =>
  h.commentService.create(user, task.id, {
    clientCommentId: `client-comment-${++seq}`,
    content,
    mentions: [],
    attachmentAssetIds: [],
    ...extra,
  });
const fresh = async () => (await h.tasks.findById(task.id)) as Task;
const outboxOf = (type: string) => h.outbox.events.filter((e) => e.type === type && e.aggregateId === task.id);

describe("task-comment.service.create", () => {
  it("tạo: commentCount +1 (KHÔNG đổi version), outbox task.comment-created (không nội dung), phát task:activity COMMENT + task:updated", async () => {
    const version = (await fresh()).version;
    const { comment, created } = await send(lan, `Chào ${mark(member)} nhé`, { mentions: [{ type: "USER", targetId: member.id }] });

    expect(created).toBe(true);
    expect(comment).toMatchObject({ taskId: task.id, content: `Chào ${mark(member)} nhé`, version: 1, editedAt: null, deletedAt: null, attachments: [], attachmentCount: 0 });
    expect(comment.author).toMatchObject({ id: lan.id, name: "Người MEMBER" });
    expect(comment.mentions).toEqual([{ type: "USER", targetId: member.id, label: "Người MEMBER" }]);
    expect(await fresh()).toMatchObject({ commentCount: 1, version });

    const evt = outboxOf("task.comment-created");
    expect(evt).toHaveLength(1);
    expect(evt[0].dedupeKey).toBe(`task.comment-created:comment:${comment.id}`);
    expect(evt[0].payload as unknown as TaskCommentCreatedPayload).toMatchObject({
      commentId: comment.id, actorId: lan.id, mentionIds: [member.id], assigneeIds: [], createdBy: member.id,
    });
    expect(JSON.stringify(evt[0].payload)).not.toContain("Chào");

    expect(h.emitter.of("task:activity").at(-1)?.payload).toMatchObject({ taskId: task.id, activity: { type: "COMMENT", comment: { id: comment.id } } });
    expect(h.emitter.of("task:updated").at(-1)?.payload).toMatchObject({ changed: ["commentCount"], actorId: lan.id });
    expect(h.activities.activities.filter((a) => a.taskId === task.id).map((a) => a.type)).toEqual(["CREATED"]); // bình luận KHÔNG ghi activity
  });

  it("tự nhắc chính mình: giữ trong mentions nhưng KHÔNG nằm trong mentionIds của sự kiện", async () => {
    await send(lan, `Ghi chú ${mark(lan)}`, { mentions: [{ type: "USER", targetId: lan.id }] });
    expect((outboxOf("task.comment-created")[0].payload as unknown as TaskCommentCreatedPayload).mentionIds).toEqual([]);
  });

  it("gửi lại cùng clientCommentId → trả bản CŨ (created:false), không tạo trùng, không đếm/outbox lần hai", async () => {
    const first = await send(lan, "Một lần thôi", { clientCommentId: "client-comment-fixed-1" });
    const again = await send(lan, "Nội dung khác nhưng cùng id", { clientCommentId: "client-comment-fixed-1" });

    expect([first.created, again.created]).toEqual([true, false]);
    expect(again.comment).toMatchObject({ id: first.comment.id, content: "Một lần thôi" });
    expect(await fresh()).toMatchObject({ commentCount: 1 });
    expect(outboxOf("task.comment-created")).toHaveLength(1);
    // Cùng clientCommentId của NGƯỜI KHÁC là bình luận khác (unique theo (tác giả, id)).
    expect((await send(member, "Của tôi", { clientCommentId: "client-comment-fixed-1" })).created).toBe(true);
  });

  it("PM2-16: nhắc người ngoài nhóm / GUEST → 400 TASK_014 {invalidMentions}; không tạo gì, draft không mất", async () => {
    const stranger = newObjectId();
    const err = await catchError(
      send(lan, `${mark(member)} ${mark(guest)} @{u:${stranger}}`, {
        mentions: [{ type: "USER", targetId: member.id }, { type: "USER", targetId: guest.id }, { type: "USER", targetId: stranger }],
      })
    );
    expect([err.statusCode, err.errorCode]).toEqual([400, "TASK_014"]);
    expect(err.details).toEqual({ invalidMentions: [guest.id, stranger] });
    expect(h.commentRepo.comments.size).toBe(0);
    expect(await fresh()).toMatchObject({ commentCount: 0 });
    expect(outboxOf("task.comment-created")).toHaveLength(0);
  });

  it("mentions[] phải khớp 1-1 với marker @{u:id} trong nội dung; @all/@role không hỗ trợ → 400 VAL_001", async () => {
    const noMarker = await catchError(send(lan, "không có marker", { mentions: [{ type: "USER", targetId: member.id }] }));
    expect([noMarker.statusCode, noMarker.errorCode]).toEqual([400, "VAL_001"]);
    const undeclared = await catchError(send(lan, `có marker ${mark(member)} mà không khai`));
    expect(undeclared.errorCode).toBe("VAL_001");
    expect((await catchError(send(lan, "gửi @{all} nhé"))).errorCode).toBe("VAL_001");
    expect((await catchError(send(lan, "gửi @{r:ADMIN} nhé"))).errorCode).toBe("VAL_001");
    // Marker sai độ dài không phải marker → chữ thường, hợp lệ.
    await expect(send(lan, "gõ @{u:xyz} thử")).resolves.toMatchObject({ created: true });
  });

  it("marker chữ hoa vẫn khớp id (chuẩn hoá chữ thường); khai trùng một người được khử trùng", async () => {
    const upper = `@{u:${member.id.toUpperCase()}}`;
    const { comment } = await send(lan, `Chào ${upper}`, { mentions: [{ type: "USER", targetId: member.id }, { type: "USER", targetId: member.id.toUpperCase() }] });
    expect(comment.mentions.map((m) => m.targetId)).toEqual([member.id]);
  });

  it("đính kèm: asset READY của mình, scope TASK_COMMENT, cùng nhóm → gắn AssetLink TASK_COMMENT + attachmentCount; sai chủ/scope/đã gắn → 400 TASK_004", async () => {
    h.assets.seed("a".repeat(24), { ownerId: lan.id, scope: "TASK_COMMENT", workspaceId: task.workspaceId });
    h.assets.seed("b".repeat(24), { ownerId: member.id, scope: "TASK_COMMENT", workspaceId: task.workspaceId }); // của người khác
    h.assets.seed("c".repeat(24), { ownerId: lan.id, scope: "TASK", workspaceId: task.workspaceId }); // sai scope
    h.assets.seed("d".repeat(24), { ownerId: lan.id, scope: "TASK_COMMENT", workspaceId: task.workspaceId, status: "PROCESSING" });
    h.assets.seed("e".repeat(24), { ownerId: lan.id, scope: "TASK_COMMENT", workspaceId: newObjectId() }); // nhóm khác

    for (const bad of ["b", "c", "d", "e", "f"]) {
      const err = await catchError(send(lan, "kèm tệp", { attachmentAssetIds: [bad.repeat(24)] }));
      expect([err.statusCode, err.errorCode]).toEqual([400, "TASK_004"]);
    }
    expect(h.commentRepo.comments.size).toBe(0);

    const ok = await send(lan, "", { attachmentAssetIds: ["a".repeat(24)] }); // chỉ tệp, không chữ
    expect(ok.comment).toMatchObject({ attachmentCount: 1 });
    expect(ok.comment.attachments).toHaveLength(1);
    expect(h.assets.attached).toMatchObject([{ assetId: "a".repeat(24), targetType: "TASK_COMMENT", targetId: ok.comment.id, actorId: lan.id }]);
    const reuse = await catchError(send(lan, "dùng lại", { attachmentAssetIds: ["a".repeat(24)] }));
    expect(reuse.errorCode).toBe("TASK_004"); // đã gắn
  });

  it("GUEST/người ngoài → 404; bảng đã lưu trữ → 403; thẻ đã xoá → 404", async () => {
    expect((await catchError(send(guest, "x"))).statusCode).toBe(404);
    expect((await catchError(send({ id: newObjectId(), email: "x@e.com" }, "x"))).statusCode).toBe(404);
    await h.boardService.archive(owner, board.id);
    expect((await catchError(send(lan, "x"))).statusCode).toBe(403);
    await h.boardService.restore(owner, board.id);
    await h.detailService.remove(member, task.id);
    expect((await catchError(send(lan, "x"))).statusCode).toBe(404);
  });
});

describe("task-comment.service.update", () => {
  it("sửa trong 15 phút: đổi nội dung, editedAt, version +1, phát task:activity; mention mới → outbox chỉ cho người MỚI", async () => {
    const { comment } = await send(lan, `Chào ${mark(member)}`, { mentions: [{ type: "USER", targetId: member.id }] });
    h.travel(14 * 60_000);
    const edited = await h.commentService.update(lan, comment.id, {
      content: `Chào ${mark(member)} và ${mark(admin)}`,
      mentions: [{ type: "USER", targetId: member.id }, { type: "USER", targetId: admin.id }],
      expectedVersion: 1,
    });

    expect(edited).toMatchObject({ version: 2, content: `Chào ${mark(member)} và ${mark(admin)}` });
    expect(edited.editedAt).not.toBeNull();
    const evt = outboxOf("task.comment-updated");
    expect(evt).toHaveLength(1);
    expect(evt[0].dedupeKey).toBe(`task.comment-updated:comment:${comment.id}:v2`);
    expect(evt[0].payload as unknown as TaskCommentUpdatedPayload).toMatchObject({ mentionIds: [admin.id], commentVersion: 2 });
    expect(h.emitter.of("task:activity").at(-1)?.payload).toMatchObject({ activity: { type: "COMMENT", comment: { id: comment.id, version: 2 } } });

    // Sửa lần nữa không thêm người mới → không có outbox thứ hai.
    await h.commentService.update(lan, comment.id, { content: `Chào ${mark(member)} và ${mark(admin)}!`, mentions: edited.mentions.map(({ type, targetId }) => ({ type, targetId })), expectedVersion: 2 });
    expect(outboxOf("task.comment-updated")).toHaveLength(1);
  });

  it("PM2-23: sửa sau 16 phút → 409 TASK_015 (nội dung không đổi)", async () => {
    const { comment } = await send(lan, "Bản gốc");
    h.travel(16 * 60_000);
    const err = await catchError(h.commentService.update(lan, comment.id, { content: "Sửa muộn", mentions: [], expectedVersion: 1 }));
    expect([err.statusCode, err.errorCode]).toEqual([409, "TASK_015"]);
    expect((await h.commentRepo.findById(comment.id))?.content).toBe("Bản gốc");
  });

  it("chỉ tác giả (người khác kể cả ADMIN → 403); lệch version → 409 RES_003; bình luận rỗng không tệp → 400; đã xoá → 404", async () => {
    const { comment } = await send(lan, "Của Lan");
    expect((await catchError(h.commentService.update(admin, comment.id, { content: "x", mentions: [], expectedVersion: 1 }))).statusCode).toBe(403);
    expect((await catchError(h.commentService.update(guest, comment.id, { content: "x", mentions: [], expectedVersion: 1 }))).statusCode).toBe(404);

    const conflict = await catchError(h.commentService.update(lan, comment.id, { content: "x", mentions: [], expectedVersion: 5 }));
    expect([conflict.statusCode, conflict.errorCode]).toEqual([409, "RES_003"]);
    expect(conflict.details).toMatchObject({ currentVersion: 1 });

    const empty = await catchError(h.commentService.update(lan, comment.id, { content: "   ", mentions: [], expectedVersion: 1 }));
    expect(empty.errorCode).toBe("VAL_001");

    await h.commentService.remove(lan, comment.id, {});
    expect((await catchError(h.commentService.update(lan, comment.id, { content: "y", mentions: [], expectedVersion: 2 }))).statusCode).toBe(404);
  });
});

describe("task-comment.service.remove", () => {
  it("tác giả xoá: tombstone (nội dung/nhắc/tệp không lộ), commentCount −1, gỡ AssetLink, KHÔNG audit/activity; xoá lần hai không giảm đếm nữa", async () => {
    h.assets.seed("a".repeat(24), { ownerId: lan.id, scope: "TASK_COMMENT", workspaceId: task.workspaceId });
    const { comment } = await send(lan, `Chào ${mark(member)}`, { mentions: [{ type: "USER", targetId: member.id }], attachmentAssetIds: ["a".repeat(24)] });

    await h.commentService.remove(lan, comment.id, {});
    expect(await fresh()).toMatchObject({ commentCount: 0 });
    expect(h.assets.attached).toHaveLength(0);
    expect(h.audit.records).toHaveLength(0);
    expect(h.activities.activities.some((a) => a.type === "COMMENT_DELETED_BY_ADMIN")).toBe(false);

    const page = await h.commentService.list(member, task.id, { limit: 30 });
    expect(page.data[0]).toMatchObject({ id: comment.id, content: "", mentions: [], attachments: [], attachmentCount: 0 });
    expect(page.data[0].deletedAt).not.toBeNull();
    expect((await catchError(h.commentService.remove(lan, comment.id, {}))).statusCode).toBe(404); // đã xoá
    expect(await fresh()).toMatchObject({ commentCount: 0 });
  });

  it("xoá bình luận NGƯỜI KHÁC: OWNER/ADMIN + lý do bắt buộc (thiếu → 400) + audit task-comment.remove + activity COMMENT_DELETED_BY_ADMIN; MEMBER → 403", async () => {
    const { comment } = await send(lan, "Nội dung vi phạm");
    expect((await catchError(h.commentService.remove(member, comment.id, { reason: "Không đủ quyền để xoá" }))).statusCode).toBe(403);
    expect((await catchError(h.commentService.remove(guest, comment.id, {}))).statusCode).toBe(404);

    const missing = await catchError(h.commentService.remove(admin, comment.id, {}));
    expect([missing.statusCode, missing.errorCode]).toEqual([400, "VAL_001"]);
    expect(h.commentRepo.comments.get(comment.id)?.deletedAt).toBeNull();

    await h.commentService.remove(admin, comment.id, { reason: "Nội dung không phù hợp" });
    const stored = h.commentRepo.comments.get(comment.id)!;
    expect(stored).toMatchObject({ deletedBy: admin.id, deleteReason: "Nội dung không phù hợp" });
    expect(h.audit.records).toEqual([
      expect.objectContaining({
        actorId: admin.id, action: "task-comment.remove", targetType: "TaskComment", targetId: comment.id,
        workspaceId: task.workspaceId, reason: "Nội dung không phù hợp", metadata: { taskId: task.id, authorId: lan.id },
      }),
    ]);
    expect(h.activities.activities.at(-1)).toMatchObject({ type: "COMMENT_DELETED_BY_ADMIN", actorId: admin.id, after: { commentId: comment.id, authorId: lan.id } });
    expect(await fresh()).toMatchObject({ commentCount: 0 });
  });
});

describe("task-comment.service.list / task-feed.service", () => {
  it("bình luận: mới → cũ, phân trang cursor không sót/không trùng; tác giả có tên", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.unshift((await send(lan, `Bình luận ${i}`)).comment.id);

    const p1 = await h.commentService.list(member, task.id, { limit: 2 });
    expect(p1.data.map((c) => c.id)).toEqual(ids.slice(0, 2));
    expect(p1.meta).toMatchObject({ hasMore: true, limit: 2 });
    const p2 = await h.commentService.list(member, task.id, { limit: 2, cursor: p1.meta.nextCursor as string });
    const p3 = await h.commentService.list(member, task.id, { limit: 2, cursor: p2.meta.nextCursor as string });
    expect([...p1.data, ...p2.data, ...p3.data].map((c) => c.id)).toEqual(ids);
    expect(p3.meta).toEqual({ nextCursor: null, hasMore: false, limit: 2 });
    expect((await catchError(h.commentService.list(member, task.id, { limit: 2, cursor: "rác" }))).errorCode).toBe("VAL_001");
    expect((await catchError(h.commentService.list(guest, task.id, { limit: 2 }))).statusCode).toBe(404);
  });

  it("activity: mới → cũ kèm actor; ASSIGNED/UNASSIGNED được thêm tên người; phân trang; GUEST 404", async () => {
    await h.detailService.patch(member, task.id, { expectedVersion: (await fresh()).version, title: "Đổi tên", assigneeIds: [lan.id] });
    const page = await h.feedService.activity(owner, task.id, { limit: 30 });

    expect(page.data.map((a) => a.type)).toEqual(["ASSIGNED", "RENAMED", "CREATED"]); // mới → cũ
    expect(page.data[0]).toMatchObject({ actor: { id: member.id }, after: { userId: lan.id, name: "Người MEMBER" } });
    const p1 = await h.feedService.activity(owner, task.id, { limit: 2 });
    const p2 = await h.feedService.activity(owner, task.id, { limit: 2, cursor: p1.meta.nextCursor as string });
    expect([...p1.data, ...p2.data].map((a) => a.id)).toEqual(page.data.map((a) => a.id));
    expect((await catchError(h.feedService.activity(guest, task.id, { limit: 5 }))).statusCode).toBe(404);
  });

  it("mentionables: thành viên MEMBER+ (không GUEST), tìm không dấu theo từng từ, tối đa 20, không email; GUEST gọi → 404", async () => {
    const lanAnh = h.addUser("MEMBER");
    h.directory.users.set(lanAnh.id, { id: lanAnh.id, name: "Nguyễn Lan Anh", avatarUrl: null });
    const list = await h.feedService.mentionables(member, board.id, "lan");
    expect(list.map((u) => u.name)).toEqual(["Nguyễn Lan Anh"]);
    expect(list[0]).toEqual({ id: lanAnh.id, name: "Nguyễn Lan Anh", avatarUrl: null });

    const all = await h.feedService.mentionables(member, board.id, "");
    expect(all.map((u) => u.id)).not.toContain(guest.id);
    expect(all.length).toBeGreaterThanOrEqual(4);
    expect((await catchError(h.feedService.mentionables(guest, board.id, ""))).statusCode).toBe(404);
  });
});
