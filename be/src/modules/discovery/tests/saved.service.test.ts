/**
 * Unit — `SavedService` (be.md p1-09 §5.1/§5.2): SAV-01 (idempotent), SAV-02 (mất quyền → unavailable),
 * DU-03 (tin bị gỡ → unavailable, không lộ nội dung), giới hạn, ẩn phía tôi, cursor, kiểm quyền 1 lần/phạm vi.
 * Không cần Prisma/Mongo — repository in-memory + MessageScope giả.
 */
jest.mock("../../messages/public", () => ({ getMessageScope: jest.fn() }));
// Không nạp socket.emit thật (kéo cả socket.server/permission) — test truyền `emit` giả qua constructor.
jest.mock("../../../infrastructure/socket/socket.emit", () => ({ emitToUsers: jest.fn() }));

import { SavedService } from "../services/saved.service";
import { InMemorySavedMessageRepository } from "../repositories/saved-message.repository.inmemory";
import { LIMITS } from "../../../core/constants/limits";
import { ErrorCode } from "../../../core/utils/error.codes";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import type { DiscoveryScopeType } from "../entities/discovery.interface";
import {
  CHANNEL_ID,
  CHANNEL_ID_2,
  CONV_ID,
  FakeLookupRepo,
  FakeMessageSearchRepo,
  USER_A,
  USER_B,
  makeFakeScope,
  makeMessage,
  newScopeState,
  type FakeScopeState,
} from "./support/discovery-fakes";

interface Ctx {
  service: SavedService;
  saved: InMemorySavedMessageRepository;
  messages: FakeMessageSearchRepo;
  lookup: FakeLookupRepo;
  emit: jest.Mock;
  channel: FakeScopeState;
  conversation: FakeScopeState;
}

function setup(): Ctx {
  const saved = new InMemorySavedMessageRepository();
  const messages = new FakeMessageSearchRepo();
  const lookup = new FakeLookupRepo();
  const emit = jest.fn();
  const channel = newScopeState();
  const conversation = newScopeState();
  const scopes = {
    CHANNEL: makeFakeScope("CHANNEL", channel),
    CONVERSATION: makeFakeScope("CONVERSATION", conversation),
  };
  const service = new SavedService(saved, messages, lookup, (t: DiscoveryScopeType) => scopes[t], emit);
  return { service, saved, messages, lookup, emit, channel, conversation };
}

describe("SavedService.save()", () => {
  it("SAV-01: lưu 2 lần cùng tin → 1 bản ghi, cùng savedAt, chỉ phát saved:updated 1 lần", async () => {
    const { service, saved, messages, emit } = setup();
    const msg = makeMessage();
    messages.add(msg);

    const first = await service.save(USER_A, msg.id);
    const second = await service.save(USER_A, msg.id);

    expect(second).toEqual(first);
    expect(await saved.countByUser(USER_A.id)).toBe(1);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith([USER_A.id], SocketEvent.SAVED_UPDATED, { messageId: msg.id, saved: true });
  });

  it("ghi scopeType/scopeId/workspaceId/threadId từ tin (không sao nội dung)", async () => {
    const { service, saved, messages } = setup();
    const msg = makeMessage({ threadId: "eeeeeeeeeeeeeeeeeeeeeee1", threadKey: "eeeeeeeeeeeeeeeeeeeeeee1", seq: 3 });
    messages.add(msg);
    await service.save(USER_A, msg.id);
    const record = await saved.findByUserAndMessage(USER_A.id, msg.id);
    expect(record).toMatchObject({
      scopeType: "CHANNEL",
      scopeId: CHANNEL_ID,
      workspaceId: msg.workspaceId,
      threadId: "eeeeeeeeeeeeeeeeeeeeeee1",
    });
    expect(record).not.toHaveProperty("content");
  });

  it("tin không tồn tại / không đọc được → 404 (không lộ tin thuộc phạm vi riêng)", async () => {
    const { service, messages, channel } = setup();
    await expect(service.save(USER_A, "ffffffffffffffffffffffff")).rejects.toMatchObject({ statusCode: 404 });

    const msg = makeMessage();
    messages.add(msg);
    channel.readable.delete(USER_A.id);
    await expect(service.save(USER_A, msg.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("phạm vi chưa đăng ký adapter → 404", async () => {
    const saved = new InMemorySavedMessageRepository();
    const messages = new FakeMessageSearchRepo();
    const msg = makeMessage();
    messages.add(msg);
    const service = new SavedService(saved, messages, new FakeLookupRepo(), () => undefined, jest.fn());
    await expect(service.save(USER_A, msg.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("tin đã thu hồi → 409 MSG_006; tin hệ thống → 404", async () => {
    const { service, messages } = setup();
    const deleted = makeMessage({ deletedAt: new Date(), content: null });
    const system = makeMessage({ kind: "SYSTEM", authorId: null, content: null });
    messages.add(deleted, system);
    await expect(service.save(USER_A, deleted.id)).rejects.toMatchObject({ statusCode: 409, errorCode: ErrorCode.MSG_006 });
    await expect(service.save(USER_A, system.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("tin bị ẩn phía tôi (MessageHide hoặc ≤ hiddenBeforeSeq) → 404", async () => {
    const { service, messages, conversation } = setup();
    const hiddenByUser = makeMessage();
    const beforeFloor = makeMessage({ scopeType: "CONVERSATION", scopeId: CONV_ID, workspaceId: null, seq: 5 });
    messages.add(hiddenByUser, beforeFloor);
    messages.hidden.set(USER_A.id, new Set([hiddenByUser.id]));
    conversation.hiddenBeforeSeq.set(USER_A.id, 5);

    await expect(service.save(USER_A, hiddenByUser.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.save(USER_A, beforeFloor.id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("đã lưu tối đa LIMITS.saved.max → 409 SRCH_004; lưu lại tin ĐÃ lưu vẫn 200 (idempotent)", async () => {
    const { service, saved, messages } = setup();
    const existing = makeMessage();
    const fresh = makeMessage();
    messages.add(existing, fresh);
    await service.save(USER_A, existing.id);
    for (let i = 0; i < LIMITS.saved.max - 1; i += 1) {
      saved.seed({
        id: `${(i + 100).toString(16).padStart(24, "0")}`,
        userId: USER_A.id,
        messageId: `${(i + 5000).toString(16).padStart(24, "0")}`,
        scopeType: "CHANNEL",
        scopeId: CHANNEL_ID,
        workspaceId: null,
        threadId: null,
        createdAt: new Date(2026, 0, 1),
      });
    }
    expect(await saved.countByUser(USER_A.id)).toBe(LIMITS.saved.max);

    await expect(service.save(USER_A, fresh.id)).rejects.toMatchObject({ statusCode: 409, errorCode: ErrorCode.SRCH_004 });
    await expect(service.save(USER_A, existing.id)).resolves.toMatchObject({ messageId: existing.id });
  });
});

describe("SavedService.unsave()", () => {
  it("bỏ lưu: xoá bản ghi, phát saved:false; gọi lại vẫn ổn và KHÔNG phát thêm", async () => {
    const { service, saved, messages, emit } = setup();
    const msg = makeMessage();
    messages.add(msg);
    await service.save(USER_A, msg.id);
    emit.mockClear();

    await service.unsave(USER_A, msg.id);
    await service.unsave(USER_A, msg.id);

    expect(await saved.countByUser(USER_A.id)).toBe(0);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith([USER_A.id], SocketEvent.SAVED_UPDATED, { messageId: msg.id, saved: false });
  });

  it("KHÔNG kiểm quyền đọc: mất quyền/tin đã gỡ vẫn bỏ lưu được", async () => {
    const { service, saved, messages, channel } = setup();
    const msg = makeMessage();
    messages.add(msg);
    await service.save(USER_A, msg.id);
    channel.readable.clear();
    messages.messages.delete(msg.id);

    await service.unsave(USER_A, msg.id);
    expect(await saved.countByUser(USER_A.id)).toBe(0);
  });
});

describe("SavedService.list()", () => {
  const query = { limit: 30 };

  it("mục khả dụng: message preview + scope, không kèm nội dung đầy đủ", async () => {
    const { service, messages } = setup();
    const withFile = makeMessage({
      content: null,
      attachments: [{ kind: "FILE", name: "bao-cao.pdf" }],
    });
    const text = makeMessage({ scopeType: "CONVERSATION", scopeId: CONV_ID, workspaceId: null, content: "Nhớ nộp đồ án nhé" });
    messages.add(withFile, text);
    await service.save(USER_A, withFile.id);
    await service.save(USER_A, text.id);

    const { data, meta } = await service.list(USER_A, query);

    expect(meta).toEqual({ nextCursor: null, hasMore: false, limit: 30 });
    const [convItem, chanItem] = data; // mới lưu trước
    expect(convItem).toMatchObject({
      available: true,
      messageId: text.id,
      scopeType: "CONVERSATION",
      workspaceId: null,
      scope: { type: "CONVERSATION", id: CONV_ID, name: "Nhóm đồ án", kind: "GROUP", isPrivate: true },
      message: { id: text.id, authorId: USER_B.id, authorName: "Bình", excerpt: "Nhớ nộp đồ án nhé" },
    });
    expect(chanItem).toMatchObject({
      available: true,
      scope: { type: "CHANNEL", id: CHANNEL_ID, name: "chung", isPrivate: false },
      message: { excerpt: "[Tệp] bao-cao.pdf", attachmentsSummary: { count: 1, kinds: ["FILE"] } },
    });
    expect(JSON.stringify(chanItem)).not.toContain("content");
  });

  it("DU-03: tin bị thu hồi → chỉ {savedAt, messageId, available:false}, không nội dung/thumbnail/tên phạm vi", async () => {
    const { service, messages } = setup();
    const msg = makeMessage({ content: "bí mật", attachments: [{ kind: "IMAGE", name: "x.png" }] });
    messages.add(msg);
    await service.save(USER_A, msg.id);
    messages.messages.set(msg.id, { ...msg, deletedAt: new Date(), content: null, attachments: [] });

    const { data } = await service.list(USER_A, query);
    expect(data).toHaveLength(1);
    expect(Object.keys(data[0]).sort()).toEqual(["available", "messageId", "savedAt"]);
    expect(data[0]).toMatchObject({ available: false, messageId: msg.id });
  });

  it("SAV-02: mất quyền đọc (rời nhóm) → unavailable, KHÔNG có scope.name; có quyền lại → hiện lại", async () => {
    const { service, messages, conversation } = setup();
    const msg = makeMessage({ scopeType: "CONVERSATION", scopeId: CONV_ID, workspaceId: null });
    messages.add(msg);
    await service.save(USER_A, msg.id);

    conversation.readable.delete(USER_A.id);
    const left = await service.list(USER_A, query);
    expect(left.data[0]).toEqual({ savedAt: expect.any(Date), messageId: msg.id, available: false });
    expect(JSON.stringify(left.data[0])).not.toContain("Nhóm đồ án");

    conversation.readable.add(USER_A.id);
    const back = await service.list(USER_A, query);
    expect(back.data[0]).toMatchObject({ available: true });
  });

  it("tin bị ẩn phía tôi sau khi lưu (MessageHide / hiddenBeforeSeq) → unavailable", async () => {
    const { service, messages, conversation } = setup();
    const a = makeMessage({ scopeType: "CONVERSATION", scopeId: CONV_ID, workspaceId: null, seq: 3 });
    const b = makeMessage({ scopeType: "CONVERSATION", scopeId: CONV_ID, workspaceId: null, seq: 9 });
    const c = makeMessage({ seq: 4 });
    messages.add(a, b, c);
    for (const m of [a, b, c]) await service.save(USER_A, m.id);

    conversation.hiddenBeforeSeq.set(USER_A.id, 5); // ẩn a (seq 3)
    messages.hidden.set(USER_A.id, new Set([c.id])); // ẩn c bằng MessageHide

    const { data } = await service.list(USER_A, query);
    const availability = Object.fromEntries(data.map((d) => [d.messageId, d.available]));
    expect(availability).toEqual({ [a.id]: false, [b.id]: true, [c.id]: false });
  });

  it("tin bị xoá vật lý / kênh không còn → unavailable (không ném lỗi)", async () => {
    const { service, messages, lookup } = setup();
    const gone = makeMessage();
    const orphanChannel = makeMessage({ scopeId: CHANNEL_ID_2 });
    messages.add(gone, orphanChannel);
    await service.save(USER_A, gone.id);
    await service.save(USER_A, orphanChannel.id);
    messages.messages.delete(gone.id);
    lookup.channels.delete(CHANNEL_ID_2);

    const { data } = await service.list(USER_A, query);
    expect(data.map((d) => d.available)).toEqual([false, false]);
  });

  it("kiểm quyền đúng 1 lần cho mỗi phạm vi, không N lần theo số tin", async () => {
    const { service, messages, channel, conversation } = setup();
    const msgs = [
      ...Array.from({ length: 5 }, (_, i) => makeMessage({ seq: i + 1 })),
      ...Array.from({ length: 3 }, (_, i) => makeMessage({ scopeType: "CONVERSATION", scopeId: CONV_ID, workspaceId: null, seq: i + 1 })),
    ];
    messages.add(...msgs);
    for (const m of msgs) await service.save(USER_A, m.id);
    channel.canReadCalls = 0;
    conversation.canReadCalls = 0;

    const { data } = await service.list(USER_A, query);

    expect(data).toHaveLength(8);
    expect(channel.canReadCalls).toBe(1);
    expect(conversation.canReadCalls).toBe(1);
  });

  it("cursor: trang 1 có nextCursor, trang 2 nối tiếp không trùng/sót, sắp mới lưu → cũ", async () => {
    const { service, messages } = setup();
    const msgs = Array.from({ length: 5 }, (_, i) => makeMessage({ seq: i + 1 }));
    messages.add(...msgs);
    for (const m of msgs) await service.save(USER_A, m.id);

    const p1 = await service.list(USER_A, { limit: 2 });
    expect(p1.data.map((d) => d.messageId)).toEqual([msgs[4].id, msgs[3].id]);
    expect(p1.meta.hasMore).toBe(true);
    expect(p1.meta.nextCursor).toEqual(expect.any(String));

    const p2 = await service.list(USER_A, { limit: 2, cursor: p1.meta.nextCursor as string });
    expect(p2.data.map((d) => d.messageId)).toEqual([msgs[2].id, msgs[1].id]);

    const p3 = await service.list(USER_A, { limit: 2, cursor: p2.meta.nextCursor as string });
    expect(p3.data.map((d) => d.messageId)).toEqual([msgs[0].id]);
    expect(p3.meta).toEqual({ nextCursor: null, hasMore: false, limit: 2 });
  });

  it("lọc theo scopeType và workspaceId (lúc lưu); cursor hỏng → 400", async () => {
    const { service, messages } = setup();
    const ch = makeMessage({ workspaceId: "wwwwwwwwwwwwwwwwwwwwwww1" });
    const conv = makeMessage({ scopeType: "CONVERSATION", scopeId: CONV_ID, workspaceId: null });
    messages.add(ch, conv);
    await service.save(USER_A, ch.id);
    await service.save(USER_A, conv.id);

    expect((await service.list(USER_A, { ...query, scopeType: "CONVERSATION" })).data.map((d) => d.messageId)).toEqual([conv.id]);
    expect((await service.list(USER_A, { ...query, workspaceId: "wwwwwwwwwwwwwwwwwwwwwww1" })).data.map((d) => d.messageId)).toEqual([ch.id]);
    await expect(service.list(USER_A, { ...query, cursor: "@@@" })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("chỉ thấy mục của CHÍNH MÌNH", async () => {
    const { service, messages, channel } = setup();
    channel.readable.add(USER_B.id);
    const msg = makeMessage();
    messages.add(msg);
    await service.save(USER_A, msg.id);
    expect((await service.list(USER_B, query)).data).toEqual([]);
  });

  it("danh sách rỗng → không truy vấn thêm", async () => {
    const { service, lookup } = setup();
    const out = await service.list(USER_A, query);
    expect(out).toEqual({ data: [], meta: { nextCursor: null, hasMore: false, limit: 30 } });
    expect(lookup.calls).toEqual({ channels: 0, conversations: 0 });
  });
});
