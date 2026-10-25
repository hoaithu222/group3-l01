/**
 * Unit — `MessageConversionService` (p7-04 be.md §5.5–§5.6, §10): TASK-01 (chuyển tin kênh thành thẻ: thẻ chỉ có liên kết nguồn + trích dẫn khi người tạo đọc được và bảng cùng nhóm; bảng khác
 * nhóm → VAL_001 WORKSPACE_MISMATCH; 1-1 không trích dẫn), idempotent theo khoá yêu cầu, sourceRef ghi vào tin, RES-01 (cùng assetId, xác nhận mở rộng quyền, tệp phải thuộc tin,
 * nhóm đích phải khớp), thiếu cổng → 501, tin đã gỡ/không đọc được.
 */
import { AppError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";
import { CH, CONV, ChatExtHarness, WS } from "./support/chat-extensions-harness";
import { MessageConversionService, quoteOf } from "../services/message-conversion.service";

let h: ChatExtHarness;
beforeEach(() => {
  h = new ChatExtHarness();
});

async function catchApp(fn: () => Promise<unknown>): Promise<AppError> {
  try {
    await fn();
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    return err as AppError;
  }
  throw new Error("Mong đợi ném AppError nhưng không ném gì");
}

const BOARD = "b1".repeat(12);
const OTHER_BOARD = "b2".repeat(12);
const OTHER_WS = "a2".repeat(12);
const taskDto = (over: Partial<{ boardId: string; title: string; includeQuote: boolean; assigneeIds: string[] }> = {}) => ({ boardId: BOARD, title: "Nộp đồ án", assigneeIds: [], includeQuote: true, ...over });

describe("chuyển tin thành thẻ (to-task)", () => {
  beforeEach(() => {
    h.tasks.boards.set(BOARD, WS);
    h.tasks.boards.set(OTHER_BOARD, OTHER_WS);
  });

  it("TASK-01: tin kênh, bảng cùng nhóm → mô tả = trích dẫn + liên kết mở tin; thẻ mang sourceMessageRef; tin ghi sourceRef TASK", async () => {
    const alice = h.addUser();
    const m = h.sender.seedMessage({ authorId: alice.id, content: "Hạn nộp đồ án là thứ Sáu\nNhớ kèm báo cáo" });
    const r = await h.conversion.toTask(alice, m.id, taskDto({ title: "Nộp đồ án", assigneeIds: ["a9".repeat(12)] }), "req-key-0001");

    expect(r).toMatchObject({ created: true, task: { boardId: BOARD, title: "Nộp đồ án" }, sourceRef: { kind: "TASK", refId: r.task.id } });
    const input = h.tasks.created[0];
    expect(input).toMatchObject({
      boardId: BOARD,
      title: "Nộp đồ án",
      assigneeIds: ["a9".repeat(12)],
      sourceMessageRef: { scopeType: "CHANNEL", scopeId: CH, messageId: m.id, workspaceId: WS },
    });
    expect(input?.description).toBe(`> Hạn nộp đồ án là thứ Sáu\n> Nhớ kèm báo cáo\n\nhttps://app.test/channels/${CH}?m=${m.id}`);
    expect(input?.clientTaskId.length).toBeLessThanOrEqual(64);
    expect(h.sender.sourceRefs).toEqual([{ messageId: m.id, ref: expect.objectContaining({ kind: "TASK", refId: r.task.id, createdBy: alice.id }) }]);
  });

  it("includeQuote=false → mô tả CHỈ có liên kết (không sao chép nội dung); tệp đính kèm không tự sao chép", async () => {
    const alice = h.addUser();
    const m = h.sender.seedMessage({ authorId: alice.id, content: "Nội dung riêng" });
    await h.conversion.toTask(alice, m.id, taskDto({ includeQuote: false }), "req-key-0002");
    expect(h.tasks.created[0]?.description).toBe(`https://app.test/channels/${CH}?m=${m.id}`);
    expect(JSON.stringify(h.tasks.created[0])).not.toContain("Nội dung riêng");
  });

  it("bảng thuộc nhóm KHÁC nhóm của tin (kênh/nhóm chat) → 400 VAL_001 reason WORKSPACE_MISMATCH, không tạo thẻ", async () => {
    const alice = h.addUser();
    const m = h.sender.seedMessage({ authorId: alice.id });
    const err = await catchApp(() => h.conversion.toTask(alice, m.id, taskDto({ boardId: OTHER_BOARD }), "req-key-0003"));
    expect(err).toMatchObject({ statusCode: 400, errorCode: ErrorCode.VAL_001, details: { reason: "WORKSPACE_MISMATCH" } });
    expect(h.tasks.created).toHaveLength(0);
    expect(h.sender.sourceRefs).toHaveLength(0);
  });

  it("tin 1-1 (không thuộc nhóm nào): cho mọi bảng người dùng có quyền nhưng KHÔNG trích nội dung — chỉ liên kết", async () => {
    const alice = h.addUser({ scopeType: "CONVERSATION" });
    const m = h.sender.seedMessage({ authorId: alice.id, scopeType: "CONVERSATION", scopeId: CONV, content: "Chuyện riêng tư" });
    await h.conversion.toTask(alice, m.id, taskDto({ boardId: OTHER_BOARD, includeQuote: true }), "req-key-0004");
    expect(h.tasks.created[0]?.description).toBe(`https://app.test/conversations/${CONV}?m=${m.id}`);
    expect(h.tasks.created[0]?.sourceMessageRef).toMatchObject({ scopeType: "CONVERSATION", workspaceId: null });
  });

  it("không đọc được tin → 404 MSG_012 (TASK-01: người không có grant không tạo được thẻ từ tin riêng tư); tin đã thu hồi/hệ thống/khảo sát → 409 MSG_006; không có quyền tạo thẻ → lỗi của projects", async () => {
    const alice = h.addUser();
    const outsider = h.addUser({ access: null });
    const m = h.sender.seedMessage({ authorId: alice.id });
    expect(await catchApp(() => h.conversion.toTask(outsider, m.id, taskDto(), "req-key-0005"))).toMatchObject({ statusCode: 404, errorCode: ErrorCode.MSG_012 });
    expect((await catchApp(() => h.conversion.toTask(alice, "ee".repeat(12), taskDto(), "req-key-0005"))).errorCode).toBe(ErrorCode.MSG_012);

    const gone = h.sender.seedMessage({ authorId: alice.id });
    h.sender.deleteMessage(gone.id);
    const system = h.sender.seedMessage({ authorId: alice.id, kind: "SYSTEM" });
    const poll = h.sender.seedMessage({ authorId: alice.id, kind: "POLL" });
    for (const id of [gone.id, system.id, poll.id]) expect(await catchApp(() => h.conversion.toTask(alice, id, taskDto(), "req-key-0006"))).toMatchObject({ statusCode: 409, errorCode: ErrorCode.MSG_006 });

    expect((await catchApp(() => h.conversion.toTask(alice, m.id, taskDto({ boardId: "ff".repeat(12) }), "req-key-0007"))).statusCode).toBe(404);
    expect(h.tasks.created).toHaveLength(0);
  });

  it("idempotent: cùng khoá yêu cầu → cùng thẻ (created=false), tin không ghi sourceRef thứ hai; khoá khác → tạo THÊM thẻ", async () => {
    const alice = h.addUser();
    const m = h.sender.seedMessage({ authorId: alice.id });
    const a = await h.conversion.toTask(alice, m.id, taskDto(), "req-key-0008");
    const again = await h.conversion.toTask(alice, m.id, taskDto(), "req-key-0008");
    expect(again).toMatchObject({ created: false, task: { id: a.task.id } });
    expect(h.tasks.created).toHaveLength(1);
    expect(h.sender.sourceRefs).toHaveLength(1);

    const b = await h.conversion.toTask(alice, m.id, taskDto({ title: "Việc thứ hai" }), "req-key-0009");
    expect(b.task.id).not.toBe(a.task.id);
    expect(h.sender.sourceRefs).toHaveLength(2);
  });

  it("thiếu cổng tạo thẻ (module projects chưa nối) → 501 SYS_501", async () => {
    const alice = h.addUser();
    const m = h.sender.seedMessage({ authorId: alice.id });
    const bare = new MessageConversionService({ sender: h.sender, directory: h.directory });
    expect(await catchApp(() => bare.toTask(alice, m.id, taskDto(), "req-key-0010"))).toMatchObject({ statusCode: 501, errorCode: ErrorCode.SYS_501 });
  });
});

describe("lưu tệp vào tài liệu (to-resource)", () => {
  const A = "d1".repeat(12);
  const B = "d2".repeat(12);
  const dto = (over: Partial<{ workspaceId: string; assetIds: string[]; confirmVisibilityExpansion: boolean; folderId: string }> = {}) => ({ workspaceId: WS, assetIds: [A], confirmVisibilityExpansion: false, ...over });
  const withFile = (authorId: string, assetId: string, over: Partial<Parameters<ChatExtHarness["sender"]["seedMessage"]>[0]> = {}) =>
    h.sender.seedMessage({ authorId, attachments: [{ assetId, kind: "FILE", name: `${assetId.slice(0, 2)}.pdf`, mime: "application/pdf", size: 1 }], ...over });

  beforeEach(() => {
    h.resources.workspaces.add(WS);
    h.resources.workspaces.add(OTHER_WS);
  });

  it("RES-01: kênh CÔNG KHAI → tạo Resource cùng assetId (không nhân file), ghi sourceRef RESOURCE; không cần xác nhận", async () => {
    const alice = h.addUser();
    h.directory.setChannelVisibility(CH, "PUBLIC");
    const m = withFile(alice.id, A);
    const r = await h.conversion.toResource(alice, m.id, dto({ folderId: "f1".repeat(12) }));
    expect(r.resources).toHaveLength(1);
    expect(h.resources.created[0]).toMatchObject({ workspaceId: WS, assetId: A, name: "d1.pdf", folderId: "f1".repeat(12), source: { messageId: m.id } });
    expect(r.sourceRefs).toEqual([{ kind: "RESOURCE", refId: r.resources[0]?.id }]);
    expect(h.sender.sourceRefs.map((s) => s.ref.kind)).toEqual(["RESOURCE"]);
  });

  it("nguồn hẹp hơn nhóm đích (kênh riêng tư / hội thoại) → 400 VAL_001 requiresConfirmation (audience WORKSPACE) khi thiếu xác nhận; có xác nhận thì lưu được", async () => {
    const alice = h.addUser();
    h.directory.setChannelVisibility(CH, "PRIVATE");
    const m = withFile(alice.id, A);
    expect(await catchApp(() => h.conversion.toResource(alice, m.id, dto()))).toMatchObject({ statusCode: 400, errorCode: ErrorCode.VAL_001, details: { requiresConfirmation: true, audience: "WORKSPACE" } });
    expect(h.resources.created).toHaveLength(0);
    await expect(h.conversion.toResource(alice, m.id, dto({ confirmVisibilityExpansion: true }))).resolves.toBeDefined();

    // Hội thoại (1-1 / nhóm chat): luôn hẹp hơn nhóm đích → cần xác nhận.
    const dm = h.addUser({ scopeType: "CONVERSATION" });
    const dmMessage = withFile(dm.id, B, { scopeType: "CONVERSATION", scopeId: CONV });
    expect((await catchApp(() => h.conversion.toResource(dm, dmMessage.id, dto({ assetIds: [B] })))).details).toMatchObject({ requiresConfirmation: true });
  });

  it("kênh không rõ chế độ hiển thị (không tìm thấy) → coi là hẹp hơn, cần xác nhận (an toàn mặc định)", async () => {
    const alice = h.addUser();
    const m = withFile(alice.id, A);
    expect((await catchApp(() => h.conversion.toResource(alice, m.id, dto()))).details).toMatchObject({ requiresConfirmation: true });
  });

  it("tệp không thuộc tin → 400 VAL_001 ASSET_NOT_IN_MESSAGE; nhóm đích khác nhóm của tin → 400 WORKSPACE_MISMATCH; tệp đã là tài liệu → RSC_003; không có quyền tải lên nhóm đích → lỗi của resources", async () => {
    const alice = h.addUser();
    h.directory.setChannelVisibility(CH, "PUBLIC");
    const m = withFile(alice.id, A);
    expect(await catchApp(() => h.conversion.toResource(alice, m.id, dto({ assetIds: [B] })))).toMatchObject({ statusCode: 400, details: { reason: "ASSET_NOT_IN_MESSAGE", assetIds: [B] } });
    expect(await catchApp(() => h.conversion.toResource(alice, m.id, dto({ workspaceId: OTHER_WS })))).toMatchObject({ statusCode: 400, details: { reason: "WORKSPACE_MISMATCH" } });
    await h.conversion.toResource(alice, m.id, dto());
    expect(await catchApp(() => h.conversion.toResource(alice, m.id, dto()))).toMatchObject({ statusCode: 409, errorCode: ErrorCode.RSC_003 });
    h.resources.workspaces.delete(WS);
    expect((await catchApp(() => h.conversion.toResource(alice, m.id, dto()))).statusCode).toBe(404);
  });

  it("chưa có bản cài đặt cổng tài liệu (p3-01) → 501 SYS_501; tin không đọc được → 404 MSG_012", async () => {
    const alice = h.addUser();
    const outsider = h.addUser({ access: null });
    const m = withFile(alice.id, A);
    const bare = new MessageConversionService({ sender: h.sender, directory: h.directory, tasks: h.tasks });
    expect(await catchApp(() => bare.toResource(alice, m.id, dto()))).toMatchObject({ statusCode: 501, errorCode: ErrorCode.SYS_501 });
    expect((await catchApp(() => h.conversion.toResource(outsider, m.id, dto()))).errorCode).toBe(ErrorCode.MSG_012);
  });
});

describe("quoteOf", () => {
  it("mỗi dòng thành blockquote markdown; cắt còn 1000 ký tự hiển thị (không xé cặp surrogate của emoji)", () => {
    expect(quoteOf("  một\nhai\r\nba  ")).toBe("> một\n> hai\n> ba");
    const long = quoteOf("😀".repeat(1500));
    expect([...long].length).toBe(2 + 1000 + 1);
    expect(long.endsWith("…")).toBe(true);
  });
});
