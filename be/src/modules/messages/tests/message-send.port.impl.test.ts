/**
 * Unit — `MessageSendPortImpl` (p7-04, cổng `IMessageSendPort`): module khác gửi/đọc tin THAY người dùng bằng CHÍNH `MessageService` — `send(kind POLL)` + `onCreated` cùng transaction, replay
 * không chạy lại `onCreated`, `validateDraft` không ghi gì, quyền đọc/ghi qua `MessageScope`, `sourceRefs` khử trùng, thu hồi khảo sát ghi hàng outbox `poll.message-deleted`,
 * và `MessageView.poll` ghép qua cổng `MessagePollReader`. Dùng `InMemoryMessageRepository` + fake scope; `withTransaction`/outbox mock (cùng khuôn `message.service.send-thread.test.ts`).
 */
const mockOutbox: Array<{ type: string; jobName: string; aggregateId: string; dedupeKey: string; payload: Record<string, unknown> }> = [];
const mockEvents: string[] = [];
const TX_TOKEN = { tx: true };
const mockAssetFindMany = jest.fn();

jest.mock("../../../infrastructure/database", () => ({
  prisma: { asset: { findMany: (...args: unknown[]) => mockAssetFindMany(...args) } },
  withTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
    mockEvents.push("tx:start");
    const result = await fn(TX_TOKEN);
    mockEvents.push("tx:commit");
    return result;
  },
}));
jest.mock("../../../infrastructure/queue", () => ({
  outbox: {
    add: async (_tx: unknown, event: (typeof mockOutbox)[number]) => {
      mockOutbox.push(event);
    },
  },
}));
jest.mock("../../assets/public", () => ({ createAssetLinkService: () => ({}) }));

import { AppError, NotFoundError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";
import { LIMITS } from "../../../core/constants/limits";
import { clearMessagePollReader, registerMessagePollReader, type MessagePollView } from "../../../shared/ports/message-poll-reader.port";
import type { AuthUser } from "../../../core/types/express";
import type { IPortUserLookup } from "../repositories/port-user.lookup";
import { MessageSendPortImpl } from "../services/message-send.port.impl";
import { CH, CONV, U1, U2, WS, makeHarness, seedMessage, userOf } from "./support/message-service.harness";

const activeUsers = new Set<string>();
const users: IPortUserLookup = { findActive: async (id): Promise<AuthUser | null> => (activeUsers.has(id) ? userOf(id) : null) };

function setup(scopeType: "CHANNEL" | "CONVERSATION" = "CHANNEL") {
  const h = makeHarness(scopeType);
  const port = new MessageSendPortImpl(h.service, h.repo, users, () => h.scope);
  return { ...h, port };
}

const cid = (n: number): string => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;

beforeEach(() => {
  mockOutbox.length = 0;
  mockEvents.length = 0;
  activeUsers.clear();
  activeUsers.add(U1);
  activeUsers.add(U2);
  clearMessagePollReader();
});

describe("send()", () => {
  it("kind POLL: tạo tin POLL, onCreated chạy TRONG transaction với tin vừa tạo, outbox mang kind POLL", async () => {
    const { port, repo } = setup();
    const seen: Array<{ tx: unknown; kind: string; id: string }> = [];
    const result = await port.send({
      authorId: U1,
      scopeType: "CHANNEL",
      scopeId: CH,
      clientMessageId: cid(1),
      kind: "POLL",
      content: "Đi ăn ở đâu?",
      onCreated: async (tx, m) => {
        seen.push({ tx, kind: m.kind, id: m.id });
      },
    });

    expect(result.replayed).toBe(false);
    expect(result.view).toMatchObject({ kind: "POLL", content: "Đi ăn ở đâu?", scopeId: CH });
    expect(seen).toEqual([{ tx: TX_TOKEN, kind: "POLL", id: result.view.id }]);
    expect((await repo.findById(result.view.id))?.kind).toBe("POLL");
    expect(mockOutbox.find((e) => e.type === "message.created")?.payload).toMatchObject({ kind: "POLL" });
  });

  it("gửi lại cùng clientMessageId → tin cũ (replayed), onCreated KHÔNG chạy lần hai", async () => {
    const { port } = setup();
    const onCreated = jest.fn().mockResolvedValue(undefined);
    const input = { authorId: U1, scopeType: "CHANNEL" as const, scopeId: CH, clientMessageId: cid(2), kind: "POLL" as const, content: "Câu hỏi", onCreated };
    const first = await port.send(input);
    const second = await port.send(input);
    expect(second.replayed).toBe(true);
    expect(second.view.id).toBe(first.view.id);
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it("onCreated ném lỗi → lỗi lan ra và giao dịch KHÔNG commit (rollback cả tin)", async () => {
    const { port } = setup();
    await expect(
      port.send({ authorId: U1, scopeType: "CHANNEL", scopeId: CH, clientMessageId: cid(3), kind: "POLL", content: "x", onCreated: async () => Promise.reject(new Error("ghi Poll lỗi")) })
    ).rejects.toThrow("ghi Poll lỗi");
    expect(mockEvents).not.toContain("tx:commit");
  });

  it("mặc định kind USER; người gửi không hoạt động → 404; mất quyền ghi → 403 MSG_004; không thấy phạm vi → 404", async () => {
    const { port, scope } = setup();
    const ok = await port.send({ authorId: U1, scopeType: "CHANNEL", scopeId: CH, clientMessageId: cid(4), content: "Xin chào" });
    expect(ok.view.kind).toBe("USER");

    activeUsers.delete(U2);
    await expect(port.send({ authorId: U2, scopeType: "CHANNEL", scopeId: CH, clientMessageId: cid(5), content: "x" })).rejects.toBeInstanceOf(NotFoundError);

    scope.setAccess({ allowed: false });
    await expect(port.send({ authorId: U1, scopeType: "CHANNEL", scopeId: CH, clientMessageId: cid(6), content: "x" })).rejects.toMatchObject({ statusCode: 403, errorCode: ErrorCode.MSG_004 });
    scope.setAccess({ allowed: true, visible: false });
    await expect(port.send({ authorId: U1, scopeType: "CHANNEL", scopeId: CH, clientMessageId: cid(7), content: "x" })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("validateDraft()", () => {
  it("kiểm nội dung như send() nhưng KHÔNG ghi gì: trống → MSG_007, quá dài → MSG_001, chuẩn hoá trả về", async () => {
    const { port, repo } = setup();
    await expect(port.validateDraft(U1, "CHANNEL", CH, { content: "   " })).rejects.toMatchObject({ errorCode: ErrorCode.MSG_007 });
    await expect(port.validateDraft(U1, "CHANNEL", CH, { content: "a".repeat(LIMITS.message.maxChars + 1) })).rejects.toMatchObject({ errorCode: ErrorCode.MSG_001 });
    const draft = await port.validateDraft(U1, "CHANNEL", CH, { content: "Xin chào   ", attachmentAssetIds: [] });
    expect(draft).toMatchObject({ content: "Xin chào", mentions: [], attachmentAssetIds: [], replyToId: null });
    expect(repo.all()).toHaveLength(0);
    expect(mockOutbox).toHaveLength(0);
  });

  it("tin trả lời phải cùng phạm vi (MSG_006); tệp lạ → MSG_005", async () => {
    const { port, repo } = setup();
    const other = seedMessage(repo, { scopeId: CONV, scopeType: "CONVERSATION" });
    await expect(port.validateDraft(U1, "CHANNEL", CH, { content: "x", replyToId: other.id })).rejects.toMatchObject({ errorCode: ErrorCode.MSG_006 });
    mockAssetFindMany.mockResolvedValue([]);
    await expect(port.validateDraft(U1, "CHANNEL", CH, { attachmentAssetIds: ["a1".repeat(12)] })).rejects.toMatchObject({ errorCode: ErrorCode.MSG_005 });
  });
});

describe("canWrite() / getReadable()", () => {
  it("canWrite: người không hoạt động → không đọc được; phạm vi từ chối → readable nhưng không allowed; kèm workspaceId", async () => {
    const { port, scope } = setup();
    expect(await port.canWrite(U1, "CHANNEL", CH)).toEqual({ readable: true, allowed: true, workspaceId: WS });
    scope.setAccess({ allowed: false });
    expect(await port.canWrite(U1, "CHANNEL", CH)).toEqual({ readable: true, allowed: false, workspaceId: WS });
    scope.setAccess({ visible: false });
    expect(await port.canWrite(U1, "CHANNEL", CH)).toEqual({ readable: false, allowed: false, workspaceId: null });
    activeUsers.delete(U1);
    expect((await port.canWrite(U1, "CHANNEL", CH)).readable).toBe(false);
  });

  it("getReadable: null khi không tồn tại / không thấy phạm vi; tin đã thu hồi trả về rỗng nội dung + deletedAt; kèm năng lực", async () => {
    const { port, repo, scope } = setup();
    const m = seedMessage(repo, { content: "Bí mật" });
    const readable = await port.getReadable(U1, m.id);
    expect(readable).toMatchObject({ id: m.id, content: "Bí mật", deletedAt: null, workspaceId: WS, myPermissions: { canModerate: false, canWrite: true } });
    expect(await port.getReadable(U1, "ff".repeat(12))).toBeNull();

    const gone = seedMessage(repo, { deletedAt: new Date(), content: null });
    expect(await port.getReadable(U1, gone.id)).toMatchObject({ content: null, attachments: [] });
    expect((await port.getReadable(U1, gone.id))?.deletedAt).not.toBeNull();

    scope.setAccess({ visible: false });
    expect(await port.getReadable(U1, m.id)).toBeNull();
  });
});

describe("appendSourceRef()", () => {
  it("thêm tham chiếu, khử trùng theo (kind, refId), tin không tồn tại → 404; MessageView.sourceRefs chỉ có khi có tham chiếu", async () => {
    const { port, repo, service } = setup();
    const m = seedMessage(repo);
    const ref = { kind: "TASK" as const, refId: "aa".repeat(12), createdBy: U1, createdAt: new Date("2026-09-27T00:00:00Z") };
    await port.appendSourceRef(m.id, ref);
    await port.appendSourceRef(m.id, ref);
    expect((await repo.findById(m.id))?.sourceRefs).toHaveLength(1);
    await port.appendSourceRef(m.id, { ...ref, kind: "RESOURCE" });
    expect((await repo.findById(m.id))?.sourceRefs.map((s) => s.kind)).toEqual(["TASK", "RESOURCE"]);
    await expect(port.appendSourceRef("ee".repeat(12), ref)).rejects.toBeInstanceOf(NotFoundError);

    const view = await service.get(userOf(U1), m.id);
    expect(view.sourceRefs).toEqual([
      { kind: "TASK", refId: ref.refId, createdAt: ref.createdAt },
      { kind: "RESOURCE", refId: ref.refId, createdAt: ref.createdAt },
    ]);
    const plain = seedMessage(repo);
    expect("sourceRefs" in (await service.get(userOf(U1), plain.id))).toBe(false);
  });
});

describe("tin khảo sát (POLL) trong engine", () => {
  it("tác giả thu hồi được tin POLL → outbox `poll.message-deleted` (một dòng, idempotent theo tin); tin USER thu hồi KHÔNG ghi dòng này; tin SYSTEM không thu hồi được", async () => {
    const { service, repo } = setup();
    const poll = seedMessage(repo, { kind: "POLL", content: "Câu hỏi?" });
    await service.recall(userOf(U1), poll.id, undefined);
    const rows = mockOutbox.filter((e) => e.jobName === "poll.message-deleted");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ dedupeKey: `poll.message-deleted:message:${poll.id}`, payload: { messageId: poll.id } });

    const plain = seedMessage(repo);
    await service.recall(userOf(U1), plain.id, undefined);
    expect(mockOutbox.filter((e) => e.jobName === "poll.message-deleted")).toHaveLength(1);

    const system = seedMessage(repo, { kind: "SYSTEM", authorId: null });
    await expect(service.recall(userOf(U1), system.id, undefined)).rejects.toBeInstanceOf(AppError);
  });

  it("myPermissions: tác giả khảo sát thu hồi/báo cáo được như tin thường nhưng KHÔNG sửa, không chuyển tiếp", async () => {
    const { service, repo } = setup();
    const poll = seedMessage(repo, { kind: "POLL", content: "Câu hỏi?", authorId: U1 });
    const asAuthor = await service.get(userOf(U1), poll.id);
    expect(asAuthor.myPermissions).toMatchObject({ canEdit: false, canRecall: true, canForward: false, canReport: false });
    const asOther = await service.get(userOf(U2), poll.id);
    expect(asOther.myPermissions).toMatchObject({ canRecall: false, canReport: true });
  });

  it("MessageView.poll ghép qua cổng MessagePollReader (1 lượt cho cả trang); tin đã thu hồi hoặc chưa đăng ký cổng → không có poll", async () => {
    const { service, repo } = setup();
    const poll = seedMessage(repo, { kind: "POLL", content: "Câu hỏi?", seq: 1 });
    const gone = seedMessage(repo, { kind: "POLL", content: null, seq: 2, deletedAt: new Date() });
    const normal = seedMessage(repo, { seq: 3 });

    const before = await service.list(userOf(U1), "CHANNEL", CH, { limit: 30 });
    expect(before.data.every((v) => !("poll" in v))).toBe(true);

    const pollView: MessagePollView = {
      id: "pp".repeat(12),
      messageId: poll.id,
      scopeType: "CHANNEL",
      scopeId: CH,
      question: "Câu hỏi?",
      multi: false,
      anonymous: false,
      closesAt: null,
      status: "OPEN",
      closeReason: null,
      options: [],
      voterCount: 0,
      myOptionIds: [],
      canClose: false,
      canViewVoters: true,
      version: 1,
    };
    const pollsOf = jest.fn().mockResolvedValue(new Map([[poll.id, pollView]]));
    registerMessagePollReader({ pollsOf });

    const page = await service.list(userOf(U1), "CHANNEL", CH, { limit: 30 });
    expect(pollsOf).toHaveBeenCalledTimes(1);
    expect(pollsOf).toHaveBeenCalledWith({ userId: U1, canModerate: false }, [poll.id]);
    const byId = new Map(page.data.map((v) => [v.id, v]));
    expect(byId.get(poll.id)?.poll).toEqual(pollView);
    expect(byId.get(gone.id) && "poll" in (byId.get(gone.id) as object)).toBe(false);
    expect(byId.get(normal.id) && "poll" in (byId.get(normal.id) as object)).toBe(false);
  });
});
