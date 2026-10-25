import { ReadMarkerService, type MarkReadJob, type ReadMarkerDeps } from "../services/read-marker.service";
import { InMemoryReadStateRepository } from "../repositories/read-state.repository.inmemory";
import type { UnreadCache, UnreadSummaryChangedReason } from "../services/unread-cache";
import type { AuthUser } from "../../../core/types/express";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";

const oid = (n: number): string => `64b${String(n).padStart(21, "0")}`;
const [ME, OTHER, CONV, CH, THREAD, WS, ROOT] = [oid(1), oid(2), oid(100), oid(200), oid(300), oid(500), oid(301)];
// `THREAD` = Thread.id; `ROOT` = id TIN GỐC (= Thread.parentMessageId = Message.threadId) — hai id khác nhau.
const user: AuthUser = { id: ME, email: "me@e.com" };

interface Rig {
  svc: ReadMarkerService;
  repo: InMemoryReadStateRepository;
  emitted: { userId: string; event: string; payload: Record<string, unknown> }[];
  jobs: MarkReadJob[];
  receipts: { conversationId: string; userId: string; seq: number }[];
  invalidated: string[];
  summaryChanged: { userId: string; reason: UnreadSummaryChangedReason }[];
  access: { visible: boolean };
}

function makeRig(): Rig {
  const repo = new InMemoryReadStateRepository();
  repo.conversations.set(CONV, 42);
  repo.channels.set(CH, { workspaceId: WS, lastSeq: 100 });
  repo.threads.set(THREAD, { id: THREAD, parentMessageId: ROOT, workspaceId: WS, channelId: CH, lastReplySeq: 9 });
  repo.members.set(`${CONV}:${ME}`, { lastReadSeq: 0, unreadCount: 42, mentionCount: 2, markedUnread: false, active: true, activityAt: new Date("2026-09-19T09:00:00Z") });

  const rig = { repo, emitted: [], jobs: [], receipts: [], invalidated: [], summaryChanged: [], access: { visible: true } } as unknown as Rig;
  const cache = {
    invalidateSummary: (u: string) => {
      rig.invalidated.push(`summary:${u}`);
      return Promise.resolve();
    },
    invalidateChannel: (u: string, ch: string) => {
      rig.invalidated.push(`ch:${u}:${ch}`);
      return Promise.resolve();
    },
  } as unknown as UnreadCache;
  const deps: ReadMarkerDeps = {
    canRead: () => Promise.resolve({ visible: rig.access.visible, workspaceId: WS }),
    emitToUser: (userId, event, payload) => void rig.emitted.push({ userId, event, payload: payload as Record<string, unknown> }),
    enqueueMarkRead: (job) => {
      rig.jobs.push(job);
      return Promise.resolve();
    },
    getReceiptPublisher: () => ({
      publish: (conversationId, userId, seq) => {
        rig.receipts.push({ conversationId, userId, seq });
        return Promise.resolve();
      },
    }),
    notifySummaryChanged: (userId, reason) => {
      rig.summaryChanged.push({ userId, reason });
      return Promise.resolve();
    },
    now: () => new Date("2026-09-19T10:00:00.000Z"),
  };
  rig.svc = new ReadMarkerService(repo, cache, deps);
  return rig;
}

describe("ReadMarkerService.mark — mốc chỉ tăng, kẹp theo lastSeq", () => {
  it("CONVERSATION: tiến tới seq → changed, phát read:updated + read:receipt + job đánh dấu hộp thư", async () => {
    const rig = makeRig();
    rig.repo.unreadAfter = () => 2;
    const res = await rig.svc.mark(user, { streamType: "CONVERSATION", streamId: CONV, lastReadSeq: 40, deviceId: "dev-A" });

    expect(res).toEqual({ streamType: "CONVERSATION", streamId: CONV, lastReadSeq: 40, changed: true });
    expect(rig.emitted).toEqual([
      {
        userId: ME,
        event: SocketEvent.READ_UPDATED,
        payload: { streamType: "CONVERSATION", streamId: CONV, lastReadSeq: 40, unreadCount: 2, mentionCount: 0, originDeviceId: "dev-A" },
      },
    ]);
    expect(rig.receipts).toEqual([{ conversationId: CONV, userId: ME, seq: 40 }]);
    expect(rig.jobs).toEqual([{ userId: ME, scopeType: "CONVERSATION", scopeId: CONV, streamKey: "root", seq: 40 }]);
    expect(rig.invalidated).toContain(`summary:${ME}`);
  });

  it("NT-03: marker cũ (40 sau 42) KHÔNG lùi mốc, không phát gì, trả hiện trạng", async () => {
    const rig = makeRig();
    await rig.svc.mark(user, { streamType: "CONVERSATION", streamId: CONV, lastReadSeq: 42 });
    rig.emitted.length = 0;
    rig.jobs.length = 0;
    rig.receipts.length = 0;

    const res = await rig.svc.mark(user, { streamType: "CONVERSATION", streamId: CONV, lastReadSeq: 40 });
    expect(res).toEqual({ streamType: "CONVERSATION", streamId: CONV, lastReadSeq: 42, changed: false });
    expect(rig.emitted).toEqual([]);
    expect(rig.jobs).toEqual([]);
    expect(rig.receipts).toEqual([]);
  });

  it("kẹp: lastReadSeq vượt lastSeq của luồng → bị kẹp về lastSeq (không lỗi)", async () => {
    const rig = makeRig();
    const res = await rig.svc.mark(user, { streamType: "CONVERSATION", streamId: CONV, lastReadSeq: 9999 });
    expect(res.lastReadSeq).toBe(42);
    expect(res.changed).toBe(true);
  });

  it("NT-03: hai marker song song (40 và 42) → kết quả cuối luôn 42, marker 40 tới sau không đổi gì", async () => {
    const rig = makeRig();
    const [a, b] = await Promise.all([
      rig.svc.mark(user, { streamType: "CHANNEL", streamId: CH, lastReadSeq: 42 }),
      rig.svc.mark(user, { streamType: "CHANNEL", streamId: CH, lastReadSeq: 40 }),
    ]);
    expect(rig.repo.readStates.get(`${ME}:CHANNEL:${CH}`)).toBe(42);
    expect([a.changed, b.changed].filter(Boolean).length).toBeGreaterThanOrEqual(1);
    const stale = await rig.svc.mark(user, { streamType: "CHANNEL", streamId: CH, lastReadSeq: 40 });
    expect(stale).toEqual({ streamType: "CHANNEL", streamId: CH, lastReadSeq: 42, changed: false });
  });

  it("CHANNEL: không có receipt (chỉ hội thoại); job hộp thư cho luồng root của kênh", async () => {
    const rig = makeRig();
    await rig.svc.mark(user, { streamType: "CHANNEL", streamId: CH, lastReadSeq: 10 });
    expect(rig.receipts).toEqual([]);
    expect(rig.jobs).toEqual([{ userId: ME, scopeType: "CHANNEL", scopeId: CH, streamKey: "root", seq: 10 }]);
    expect(rig.emitted[0]?.payload).not.toHaveProperty("unreadCount");
    expect(rig.invalidated).toEqual([`summary:${ME}`, `ch:${ME}:${CH}`]);
  });

  it("NT-02: THREAD dùng lastReplySeq làm trần; job đánh dấu hộp thư theo streamKey = id TIN GỐC (khớp NotificationRecipient.streamKey) của KÊNH chứa thread (kênh không bị đánh dấu)", async () => {
    const rig = makeRig();
    const res = await rig.svc.mark(user, { streamType: "THREAD", streamId: THREAD, lastReadSeq: 50 });
    expect(res).toEqual({ streamType: "THREAD", streamId: THREAD, lastReadSeq: 9, changed: true });
    expect(rig.jobs).toEqual([{ userId: ME, scopeType: "CHANNEL", scopeId: CH, streamKey: ROOT, seq: 9 }]);
    expect(rig.repo.readStates.has(`${ME}:CHANNEL:${CH}`)).toBe(false);
  });

  it("THREAD: client gửi id TIN GỐC (Message.threadId) thay vì Thread.id → chuẩn hoá về cùng một mốc (không tách đôi ReadState)", async () => {
    const rig = makeRig();
    const res = await rig.svc.mark(user, { streamType: "THREAD", streamId: ROOT, lastReadSeq: 4 });
    expect(res).toEqual({ streamType: "THREAD", streamId: THREAD, lastReadSeq: 4, changed: true });
    expect(rig.repo.readStates.get(`${ME}:THREAD:${THREAD}`)).toBe(4);
    expect(rig.repo.readStates.has(`${ME}:THREAD:${ROOT}`)).toBe(false);
    expect(rig.jobs[0]).toMatchObject({ streamKey: ROOT, seq: 4 });
    // gửi lại bằng Thread.id với mốc thấp hơn → không lùi
    expect((await rig.svc.mark(user, { streamType: "THREAD", streamId: THREAD, lastReadSeq: 2 })).changed).toBe(false);
  });

  it("không đọc được luồng (404 trung tính): CONVERSATION/CHANNEL/THREAD đều ném NotFound, không ghi gì", async () => {
    const rig = makeRig();
    rig.access.visible = false;
    for (const [streamType, streamId] of [["CONVERSATION", CONV], ["CHANNEL", CH], ["THREAD", THREAD]] as const) {
      await expect(rig.svc.mark(user, { streamType, streamId, lastReadSeq: 1 })).rejects.toMatchObject({ statusCode: 404 });
    }
    expect(rig.emitted).toEqual([]);
    expect(rig.repo.readStates.size).toBe(0);
  });

  it("luồng không tồn tại → 404", async () => {
    const rig = makeRig();
    await expect(rig.svc.mark(user, { streamType: "CHANNEL", streamId: oid(999), lastReadSeq: 1 })).rejects.toMatchObject({ statusCode: 404 });
    await expect(rig.svc.mark(user, { streamType: "THREAD", streamId: oid(998), lastReadSeq: 1 })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("không còn là member ACTIVE của hội thoại → 404", async () => {
    const rig = makeRig();
    rig.repo.members.get(`${CONV}:${ME}`)!.active = false;
    await expect(rig.svc.mark(user, { streamType: "CONVERSATION", streamId: CONV, lastReadSeq: 1 })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("gỡ cờ 'đánh dấu chưa đọc' khi mở lại hội thoại dù mốc không tiến", async () => {
    const rig = makeRig();
    await rig.svc.mark(user, { streamType: "CONVERSATION", streamId: CONV, lastReadSeq: 42 });
    rig.repo.members.get(`${CONV}:${ME}`)!.markedUnread = true;
    const res = await rig.svc.mark(user, { streamType: "CONVERSATION", streamId: CONV, lastReadSeq: 42 });
    expect(res.changed).toBe(true);
    expect(rig.repo.members.get(`${CONV}:${ME}`)?.markedUnread).toBe(false);
  });

  it("lỗi xếp job/phát socket không làm hỏng request (mốc đã commit)", async () => {
    const rig = makeRig();
    const failing = new ReadMarkerService(rig.repo, { invalidateSummary: () => Promise.resolve(), invalidateChannel: () => Promise.resolve() } as unknown as UnreadCache, {
      canRead: () => Promise.resolve({ visible: true, workspaceId: WS }),
      emitToUser: () => {
        throw new Error("Socket.IO chưa init");
      },
      enqueueMarkRead: () => Promise.reject(new Error("queue down")),
      getReceiptPublisher: () => null,
      notifySummaryChanged: () => Promise.resolve(),
    });
    await expect(failing.mark(user, { streamType: "CHANNEL", streamId: CH, lastReadSeq: 5 })).resolves.toMatchObject({ changed: true });
  });
});

describe("ReadMarkerService.readAllConversations (NT-13)", () => {
  const addConv = (rig: Rig, id: string, lastSeq: number, unread: number, activityAt: Date) => {
    rig.repo.conversations.set(id, lastSeq);
    rig.repo.members.set(`${id}:${ME}`, { lastReadSeq: 0, unreadCount: unread, mentionCount: 0, markedUnread: false, active: true, activityAt });
  };

  it("chỉ hội thoại có activityAt ≤ before được đặt lastReadSeq=lastSeq; tin đến sau `before` vẫn chưa đọc", async () => {
    const rig = makeRig();
    rig.repo.members.delete(`${CONV}:${ME}`);
    const before = new Date("2026-09-19T09:59:59.000Z");
    addConv(rig, oid(101), 10, 3, new Date("2026-09-19T09:00:00.000Z"));
    addConv(rig, oid(102), 20, 5, new Date("2026-09-19T10:00:01.000Z")); // có tin mới SAU mốc

    const res = await rig.svc.readAllConversations(user, before);
    expect(res).toEqual({ updated: 1 });
    expect(rig.repo.members.get(`${oid(101)}:${ME}`)?.lastReadSeq).toBe(10);
    expect(rig.repo.members.get(`${oid(102)}:${ME}`)?.lastReadSeq).toBe(0);
    expect(rig.repo.members.get(`${oid(102)}:${ME}`)?.unreadCount).toBe(5);
  });

  it("phát unread:summary-changed (READ_ALL), read:receipt và job hộp thư cho mỗi hội thoại đã đổi", async () => {
    const rig = makeRig();
    rig.repo.members.delete(`${CONV}:${ME}`);
    addConv(rig, oid(101), 10, 3, new Date("2026-09-19T09:00:00.000Z"));
    await rig.svc.readAllConversations(user, new Date("2026-09-19T09:59:59.000Z"));

    expect(rig.summaryChanged).toEqual([{ userId: ME, reason: "READ_ALL" }]);
    expect(rig.receipts).toEqual([{ conversationId: oid(101), userId: ME, seq: 10 }]);
    expect(rig.jobs).toEqual([{ userId: ME, scopeType: "CONVERSATION", scopeId: oid(101), streamKey: "root", seq: 10 }]);
  });

  it("không có gì để đọc → updated 0, không phát summary-changed", async () => {
    const rig = makeRig();
    rig.repo.members.clear();
    expect(await rig.svc.readAllConversations(user, new Date("2026-09-19T09:59:59.000Z"))).toEqual({ updated: 0 });
    expect(rig.summaryChanged).toEqual([]);
  });

  it("before quá xa tương lai → NOTI_003", async () => {
    const rig = makeRig();
    await expect(rig.svc.readAllConversations(user, new Date("2026-09-19T12:00:00.000Z"))).rejects.toMatchObject({
      errorCode: "NOTI_003",
      statusCode: 400,
    });
  });

  it("không đụng hội thoại của người khác (OTHER) — chỉ member của chính mình", async () => {
    const rig = makeRig();
    rig.repo.members.delete(`${CONV}:${ME}`);
    rig.repo.members.set(`${CONV}:${OTHER}`, { lastReadSeq: 0, unreadCount: 3, mentionCount: 0, markedUnread: false, active: true, activityAt: new Date("2026-09-19T09:00:00Z") });
    expect(await rig.svc.readAllConversations(user, new Date("2026-09-19T09:59:59.000Z"))).toEqual({ updated: 0 });
    expect(rig.repo.members.get(`${CONV}:${OTHER}`)?.unreadCount).toBe(3);
  });
});
