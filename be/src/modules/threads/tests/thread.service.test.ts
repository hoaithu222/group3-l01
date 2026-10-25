/**
 * Unit — `ThreadService` (be.md §5.3, §10 "Unit ThreadService"): TH-04
 * (EXPLICIT_OFF giữ nguyên), lastReplierIds, isFirstReply, `assertThreadable`
 * (MSG-30/31, tombstone), `summaries()` batch, subscription, list/cursor.
 * Dùng repository in-memory + mock socket/Prisma (không cần Mongo/Redis).
 * Race TH-01 (2 reply đầu song song → 1 thread) kiểm bằng Mongo thật ở
 * `tests/integration/threads.routes.test.ts` — in-memory không mô phỏng unique.
 */
const mockPrismaThreadUpdate = jest.fn();
jest.mock("../../../infrastructure/database", () => ({
  prisma: { thread: { update: (...args: unknown[]) => mockPrismaThreadUpdate(...args) } },
}));

const mockEmitToRoom = jest.fn();
const mockEmitToUsers = jest.fn();
jest.mock("../../../infrastructure/socket/socket.emit", () => ({
  emitToRoom: (...args: unknown[]) => mockEmitToRoom(...args),
  emitToUsers: (...args: unknown[]) => mockEmitToUsers(...args),
}));
jest.mock("../../../infrastructure/socket", () => ({ ROOM: { channel: (id: string) => `ch:${id}` } }));

const mockCanRead = jest.fn();
jest.mock("../../messages/public", () => ({
  getMessageScope: () => ({ canRead: (...args: unknown[]) => mockCanRead(...args) }),
}));

import type { Prisma } from "@prisma/client";
import { AppError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";
import { LIMITS } from "../../../core/constants/limits";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { encodeCursor } from "../../../core/utils/cursor";
import type { AssertThreadableInput, ThreadHookReplyRef, ThreadHookRootRef } from "../../../core/permission";
import type { AuthUser } from "../../../core/types/express";
import { InMemoryThreadRepository } from "../repositories/thread.repository.inmemory";
import { InMemoryThreadSubscriptionRepository } from "../repositories/thread-subscription.repository.inmemory";
import { ThreadService } from "../services/thread.service";
import type { Thread } from "../entities/thread.interface";

const WS = "w".repeat(24);
const CH = "c".repeat(24);
const ROOT = "1".repeat(24);
const ROOT_2 = "2".repeat(24);
const AUTHOR = "a".repeat(24);
const U1 = "b".repeat(24);
const U2 = "d".repeat(24);
const U3 = "e".repeat(24);
const U4 = "f".repeat(24);
const TX = {} as Prisma.TransactionClient;
const user = (id: string): AuthUser => ({ id, email: `${id}@e.com` });

function makeRoot(over: Partial<ThreadHookRootRef> = {}): ThreadHookRootRef {
  return {
    id: ROOT,
    scopeType: "CHANNEL",
    scopeId: CH,
    authorId: AUTHOR,
    threadId: null,
    deletedAt: null,
    kind: "USER",
    ...over,
  };
}

let seqCounter = 0;
function makeReply(authorId: string | null, over: Partial<ThreadHookReplyRef> = {}): ThreadHookReplyRef {
  seqCounter += 1;
  return { id: `r${seqCounter}`.padEnd(24, "0"), seq: seqCounter, createdAt: new Date(2026, 8, 19, 10, seqCounter), authorId, workspaceId: WS, ...over };
}

function makeThread(over: Partial<Thread> = {}): Thread {
  return {
    id: "t".repeat(24),
    workspaceId: WS,
    channelId: CH,
    parentMessageId: ROOT,
    parentAuthorId: AUTHOR,
    replyCount: 1,
    lastReplySeq: 1,
    lastReplyAt: new Date(2026, 8, 19, 10, 0),
    lastReplierIds: [U1],
    subscriberCount: 0,
    version: 1,
    createdAt: new Date(2026, 8, 19, 10, 0),
    updatedAt: new Date(2026, 8, 19, 10, 0),
    ...over,
  };
}

function build() {
  const threadRepo = new InMemoryThreadRepository();
  const subRepo = new InMemoryThreadSubscriptionRepository();
  return { threadRepo, subRepo, service: new ThreadService(threadRepo, subRepo) };
}

async function catchAppError(fn: () => Promise<unknown>): Promise<AppError> {
  try {
    await fn();
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    return err as AppError;
  }
  throw new Error("Mong đợi ném AppError nhưng không ném gì");
}

describe("ThreadService#assertThreadable() — MSG-30/31, tombstone", () => {
  const input = (over: Partial<AssertThreadableInput> = {}): AssertThreadableInput => ({
    root: makeRoot(),
    replyScopeType: "CHANNEL",
    replyScopeId: CH,
    ...over,
  });

  it("reply vào tin gốc hợp lệ của kênh → không ném", async () => {
    await expect(build().service.assertThreadable(input())).resolves.toBeUndefined();
  });

  it("MSG-30: gửi threadRootId trong HỘI THOẠI → 400 MSG_018 (chỉ kênh có thread)", async () => {
    const err = await catchAppError(() =>
      build().service.assertThreadable(input({ replyScopeType: "CONVERSATION", root: makeRoot({ scopeType: "CONVERSATION" }) }))
    );
    expect(err.errorCode).toBe(ErrorCode.MSG_018);
    expect(err.statusCode).toBe(400);
  });

  it("MSG-31: root đã là reply (threadId != null) → 400 MSG_019 (không lồng thread)", async () => {
    const err = await catchAppError(() => build().service.assertThreadable(input({ root: makeRoot({ threadId: ROOT_2 }) })));
    expect(err.errorCode).toBe(ErrorCode.MSG_019);
    expect(err.statusCode).toBe(400);
  });

  it("root không tồn tại / khác kênh / tin hệ thống → 409 MSG_006", async () => {
    const { service } = build();
    for (const root of [null, makeRoot({ scopeId: "9".repeat(24) }), makeRoot({ kind: "SYSTEM" })]) {
      const err = await catchAppError(() => service.assertThreadable(input({ root })));
      expect(err.errorCode).toBe(ErrorCode.MSG_006);
      expect(err.statusCode).toBe(409);
    }
  });

  it("tin khảo sát (kind POLL, p7-04) là tin của người dùng nên làm được root của thread", async () => {
    await expect(build().service.assertThreadable(input({ root: makeRoot({ kind: "POLL" }) }))).resolves.toBeUndefined();
  });

  it("root tombstone CHƯA có thread → 409 MSG_006; ĐÃ có thread → cho reply tiếp (be.md §5.3)", async () => {
    const { service, threadRepo } = build();
    const deleted = makeRoot({ deletedAt: new Date() });

    const err = await catchAppError(() => service.assertThreadable(input({ root: deleted })));
    expect(err.errorCode).toBe(ErrorCode.MSG_006);

    threadRepo.seed(makeThread());
    await expect(service.assertThreadable(input({ root: deleted }))).resolves.toBeUndefined();
  });
});

describe("ThreadService#onReplyCreated()", () => {
  it("reply ĐẦU → tạo Thread replyCount=1, isFirstReply=true, trả parentAuthorId của tin gốc", async () => {
    const { service, threadRepo } = build();
    const reply = makeReply(U1);
    const result = await service.onReplyCreated(TX, reply, makeRoot());

    expect(result).toEqual({ threadId: expect.any(String), isFirstReply: true, parentAuthorId: AUTHOR });
    const thread = await threadRepo.findByParentMessageId(ROOT);
    expect(thread).toMatchObject({
      id: result.threadId,
      workspaceId: WS,
      channelId: CH,
      replyCount: 1,
      lastReplySeq: reply.seq,
      lastReplyAt: reply.createdAt,
      lastReplierIds: [U1],
    });
  });

  it("reply thứ 2, 3… → cùng 1 Thread, replyCount tăng, isFirstReply=false", async () => {
    const { service, threadRepo } = build();
    const first = await service.onReplyCreated(TX, makeReply(U1), makeRoot());
    const second = await service.onReplyCreated(TX, makeReply(U2), makeRoot());
    const third = await service.onReplyCreated(TX, makeReply(U1), makeRoot());

    expect(second.threadId).toBe(first.threadId);
    expect(third.threadId).toBe(first.threadId);
    expect([first.isFirstReply, second.isFirstReply, third.isFirstReply]).toEqual([true, false, false]);
    const thread = await threadRepo.findByParentMessageId(ROOT);
    expect(thread?.replyCount).toBe(3);
    expect(thread?.version).toBe(3);
  });

  it(`lastReplierIds: người mới nhất trước, không trùng, tối đa ${LIMITS.thread.lastRepliersMax}`, async () => {
    const { service, threadRepo } = build();
    for (const id of [U1, U2, U1, U3, U4]) await service.onReplyCreated(TX, makeReply(id), makeRoot());
    const thread = await threadRepo.findByParentMessageId(ROOT);
    // U1 trả lời lại lần 2 được đẩy lên đầu (không trùng), rồi U3, U4 đẩy U2 ra khỏi top 3.
    expect(thread?.lastReplierIds).toEqual([U4, U3, U1]);
    expect(thread?.lastReplierIds).toHaveLength(LIMITS.thread.lastRepliersMax);
  });

  it("lastReplySeq/lastReplyAt theo reply MỚI NHẤT", async () => {
    const { service, threadRepo } = build();
    await service.onReplyCreated(TX, makeReply(U1), makeRoot());
    const last = makeReply(U2);
    await service.onReplyCreated(TX, last, makeRoot());
    const thread = await threadRepo.findByParentMessageId(ROOT);
    expect(thread).toMatchObject({ lastReplySeq: last.seq, lastReplyAt: last.createdAt });
  });

  it("tác giả reply chưa có lựa chọn → tạo ThreadSubscription AUTO_ON và tăng subscriberCount", async () => {
    const { service, subRepo, threadRepo } = build();
    const { threadId } = await service.onReplyCreated(TX, makeReply(U1), makeRoot());
    expect(await subRepo.findByThreadAndUser(threadId, U1)).toMatchObject({ state: "AUTO_ON", channelId: CH });
    expect((await threadRepo.findById(threadId))?.subscriberCount).toBe(1);
  });

  it("TH-04: đã EXPLICIT_OFF rồi tự trả lời → VẪN EXPLICIT_OFF, subscriberCount không đổi", async () => {
    const { service, subRepo, threadRepo } = build();
    const { threadId } = await service.onReplyCreated(TX, makeReply(U1), makeRoot());
    await subRepo.setState(threadId, CH, U2, "EXPLICIT_OFF");

    await service.onReplyCreated(TX, makeReply(U2), makeRoot());
    expect((await subRepo.findByThreadAndUser(threadId, U2))?.state).toBe("EXPLICIT_OFF");
    expect((await threadRepo.findById(threadId))?.subscriberCount).toBe(1); // chỉ U1
  });

  it("EXPLICIT_ON cũng được giữ nguyên (không bị hạ xuống AUTO_ON)", async () => {
    const { service, subRepo } = build();
    const { threadId } = await service.onReplyCreated(TX, makeReply(U1), makeRoot());
    await subRepo.setState(threadId, CH, U1, "EXPLICIT_ON");
    await service.onReplyCreated(TX, makeReply(U1), makeRoot());
    expect((await subRepo.findByThreadAndUser(threadId, U1))?.state).toBe("EXPLICIT_ON");
  });

  it("tác giả tin gốc KHÔNG tự động theo dõi khi người khác reply (TH-03: chỉ nhận FIRST_REPLY một lần)", async () => {
    const { service, subRepo } = build();
    const { threadId } = await service.onReplyCreated(TX, makeReply(U1), makeRoot());
    expect(await subRepo.findByThreadAndUser(threadId, AUTHOR)).toBeNull();
  });

  it("reply không có tác giả (null) → không tạo subscription, lastReplierIds rỗng", async () => {
    const { service, subRepo, threadRepo } = build();
    const { threadId } = await service.onReplyCreated(TX, makeReply(null), makeRoot());
    expect(await subRepo.listActiveThreadIdsByUser(U1, CH)).toEqual([]);
    expect((await threadRepo.findById(threadId))?.lastReplierIds).toEqual([]);
  });

  it("thiếu workspaceId (không thể xảy ra trên đường thật) → chặn cứng SYS_500, KHÔNG ghi Thread", async () => {
    const { service, threadRepo } = build();
    const err = await catchAppError(() => service.onReplyCreated(TX, makeReply(U1, { workspaceId: null }), makeRoot()));
    expect(err.errorCode).toBe(ErrorCode.SYS_500);
    expect(await threadRepo.findByParentMessageId(ROOT)).toBeNull();
  });
});

describe("ThreadService#summaries() — batch cho MessageView (be.md §4)", () => {
  it("rỗng → Map rỗng, KHÔNG chạm repository", async () => {
    const { service, threadRepo } = build();
    const spy = jest.spyOn(threadRepo, "findByParentMessageIds");
    expect((await service.summaries([])).size).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it("nhiều tin gốc → ĐÚNG 1 lần gọi repository (không N+1), id trùng được gộp; tin chưa có thread vắng mặt", async () => {
    const { service, threadRepo } = build();
    threadRepo.seed(makeThread({ id: "t1".padEnd(24, "0"), parentMessageId: ROOT, replyCount: 4, lastReplySeq: 4, lastReplierIds: [U1, U2] }));
    const spy = jest.spyOn(threadRepo, "findByParentMessageIds");

    const map = await service.summaries([ROOT, ROOT_2, ROOT]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith([ROOT, ROOT_2]);
    expect(map.size).toBe(1);
    expect(map.get(ROOT)).toEqual({
      threadId: "t1".padEnd(24, "0"),
      replyCount: 4,
      lastReplyAt: expect.any(Date),
      lastReplierIds: [U1, U2],
      lastReplySeq: 4,
    });
    expect(map.has(ROOT_2)).toBe(false);
  });
});

describe("ThreadService#emitThreadUpdated()", () => {
  it("tra Thread theo id TIN GỐC (parentMessageId, không phải Thread.id) → emit thread:updated tới room ch:{channelId}", async () => {
    const { service, threadRepo } = build();
    const t = makeThread({ replyCount: 2, lastReplySeq: 2, lastReplierIds: [U2, U1] });
    threadRepo.seed(t);

    await service.emitThreadUpdated(ROOT);
    expect(mockEmitToRoom).toHaveBeenCalledWith(`ch:${CH}`, SocketEvent.THREAD_UPDATED, {
      threadId: t.id,
      parentMessageId: ROOT,
      replyCount: 2,
      lastReplyAt: t.lastReplyAt,
      lastReplierIds: [U2, U1],
      lastReplySeq: 2,
    });

    mockEmitToRoom.mockClear();
    await service.emitThreadUpdated(t.id); // truyền nhầm Thread.id → không có thread nào khớp
    expect(mockEmitToRoom).not.toHaveBeenCalled();
  });

  it("chưa có thread → không emit, không lỗi", async () => {
    await expect(build().service.emitThreadUpdated(ROOT)).resolves.toBeUndefined();
    expect(mockEmitToRoom).not.toHaveBeenCalled();
  });
});

describe("ThreadService — getView / setSubscription / quyền đọc", () => {
  beforeEach(() => mockCanRead.mockResolvedValue({ visible: true, workspaceId: WS }));

  it("getView: trả ThreadView kèm mySubscription; myLastReadSeq/unreadReplies giữ null/0 chờ p1-07", async () => {
    const { service, threadRepo, subRepo } = build();
    const t = makeThread();
    threadRepo.seed(t);
    await subRepo.setState(t.id, CH, U1, "EXPLICIT_ON");

    await expect(service.getView(user(U1), t.id)).resolves.toEqual({
      id: t.id,
      channelId: CH,
      parentMessageId: ROOT,
      replyCount: 1,
      lastReplyAt: t.lastReplyAt,
      lastReplierIds: [U1],
      mySubscription: "EXPLICIT_ON",
      myLastReadSeq: null,
      unreadReplies: 0,
    });
    await expect(service.getView(user(U2), t.id)).resolves.toMatchObject({ mySubscription: null });
  });

  it("thread không tồn tại / người xem không đọc được kênh → 404 trung tính (không lộ tồn tại)", async () => {
    const { service, threadRepo } = build();
    await expect(service.getView(user(U1), "9".repeat(24))).rejects.toMatchObject({ statusCode: 404 });

    const t = makeThread();
    threadRepo.seed(t);
    mockCanRead.mockResolvedValue({ visible: false, workspaceId: null });
    await expect(service.getView(user(U1), t.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.setSubscription(user(U1), t.id, "EXPLICIT_ON")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("getViewByParentMessageId: chưa có thread → null", async () => {
    await expect(build().service.getViewByParentMessageId(user(U1), ROOT)).resolves.toBeNull();
  });

  it("setSubscription: bản ghi MỚI → subscriberCount +1 (best-effort) và phát thread:subscription-updated tới user", async () => {
    const { service, threadRepo } = build();
    const t = makeThread();
    threadRepo.seed(t);

    await expect(service.setSubscription(user(U1), t.id, "EXPLICIT_ON")).resolves.toEqual({ threadId: t.id, state: "EXPLICIT_ON" });
    expect(mockPrismaThreadUpdate).toHaveBeenCalledWith({ where: { id: t.id }, data: { subscriberCount: { increment: 1 } } });
    expect(mockEmitToUsers).toHaveBeenCalledWith([U1], SocketEvent.THREAD_SUBSCRIPTION_UPDATED, { threadId: t.id, state: "EXPLICIT_ON" });
  });

  it("setSubscription: đổi state bản ghi CÓ SẴN → không đổi subscriberCount; EXPLICIT_OFF ghi đè AUTO_ON", async () => {
    const { service, threadRepo, subRepo } = build();
    const t = makeThread();
    threadRepo.seed(t);
    await subRepo.setState(t.id, CH, U1, "AUTO_ON");

    await service.setSubscription(user(U1), t.id, "EXPLICIT_OFF");
    expect(mockPrismaThreadUpdate).not.toHaveBeenCalled();
    expect((await subRepo.findByThreadAndUser(t.id, U1))?.state).toBe("EXPLICIT_OFF");
  });
});

describe("ThreadService#listByChannel()", () => {
  beforeEach(() => mockCanRead.mockResolvedValue({ visible: true, workspaceId: WS }));

  function seedThreads(threadRepo: InMemoryThreadRepository, n: number): Thread[] {
    const threads = Array.from({ length: n }, (_, i) =>
      makeThread({
        id: `t${i}`.padEnd(24, "0"),
        parentMessageId: `p${i}`.padEnd(24, "0"),
        lastReplyAt: new Date(2026, 8, 19, 10, i), // i lớn hơn → mới hơn
      })
    );
    threads.forEach((t) => threadRepo.seed(t));
    return threads;
  }

  it("filter=all: mới nhất trước, phân trang cursor (limit+1 → hasMore/nextCursor), trang 2 nối tiếp không trùng", async () => {
    const { service, threadRepo } = build();
    const threads = seedThreads(threadRepo, 5);

    const page1 = await service.listByChannel(user(U1), CH, { filter: "all", limit: 2 });
    expect(page1.data.map((v) => v.id)).toEqual([threads[4].id, threads[3].id]);
    expect(page1.meta).toMatchObject({ hasMore: true, limit: 2 });
    expect(page1.meta.nextCursor).toBe(encodeCursor(threads[3].lastReplyAt as Date, threads[3].id));

    const page2 = await service.listByChannel(user(U1), CH, { filter: "all", limit: 2, cursor: page1.meta.nextCursor as string });
    expect(page2.data.map((v) => v.id)).toEqual([threads[2].id, threads[1].id]);

    const page3 = await service.listByChannel(user(U1), CH, { filter: "all", limit: 2, cursor: page2.meta.nextCursor as string });
    expect(page3.data.map((v) => v.id)).toEqual([threads[0].id]);
    expect(page3.meta).toMatchObject({ hasMore: false, nextCursor: null });
  });

  it("filter=following: chỉ thread có subscription AUTO_ON/EXPLICIT_ON của mình (loại EXPLICIT_OFF); chưa theo dõi gì → rỗng", async () => {
    const { service, threadRepo, subRepo } = build();
    const threads = seedThreads(threadRepo, 3);

    await expect(service.listByChannel(user(U1), CH, { filter: "following", limit: 10 })).resolves.toMatchObject({
      data: [],
      meta: { hasMore: false, nextCursor: null },
    });

    await subRepo.setState(threads[0].id, CH, U1, "AUTO_ON");
    await subRepo.setState(threads[1].id, CH, U1, "EXPLICIT_ON");
    await subRepo.setState(threads[2].id, CH, U1, "EXPLICIT_OFF");

    const res = await service.listByChannel(user(U1), CH, { filter: "following", limit: 10 });
    expect(res.data.map((v) => [v.id, v.mySubscription])).toEqual([
      [threads[1].id, "EXPLICIT_ON"],
      [threads[0].id, "AUTO_ON"],
    ]);
  });
});
