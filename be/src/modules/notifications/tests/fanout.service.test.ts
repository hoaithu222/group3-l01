jest.mock("../../../infrastructure/socket/socket.emit", () => ({ emitToUsers: jest.fn() }));

import { FanoutService } from "../services/fanout.service";
import { FanoutEditService } from "../services/fanout-edit.service";
import type { FanoutDeps } from "../services/fanout.types";
import type {
  ExistingRecipientRow,
  FanoutMessage,
  FanoutScopeMeta,
  IFanoutRepository,
  RecipientUpsertResult,
  UpsertMessageNotificationInput,
  UpsertRecipientsInput,
} from "../repositories/fanout.repository.interface";
import type { EffectiveMessagePreference } from "../services/preference-matrix";
import type { PushTarget } from "../entities/message-notification.types";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";

const oid = (n: number): string => `64b${String(n).padStart(21, "0")}`;
const AUTHOR = oid(1);
const [U2, U3, U4, U5] = [oid(2), oid(3), oid(4), oid(5)];
const CH = oid(100);
const CONV = oid(200);
const MSG = oid(300);
const THREAD = oid(400);
const WS = oid(500);

const pref = (over: Partial<EffectiveMessagePreference> = {}): EffectiveMessagePreference => ({
  mode: "ALL",
  dnd: false,
  lockScreenPreview: "HIDDEN",
  sound: true,
  ...over,
});

class FakeRepo implements IFanoutRepository {
  message: FanoutMessage | null;
  meta: FanoutScopeMeta = { workspaceId: WS, name: "kênh", restricted: false };
  notifications: UpsertMessageNotificationInput[] = [];
  rows = new Map<string, ExistingRecipientRow & { rowKind: string; filterBucket: string; cancelled?: boolean }>();
  outcomes: { userId: string; status: string; skipReason?: string }[] = [];
  cancelled: string[] = [];

  constructor(message: FanoutMessage | null) {
    this.message = message;
  }
  findMessage(): Promise<FanoutMessage | null> {
    return Promise.resolve(this.message);
  }
  loadScopeMeta(): Promise<FanoutScopeMeta | null> {
    return Promise.resolve(this.meta);
  }
  loadUserNames(): Promise<Map<string, string>> {
    return Promise.resolve(new Map<string, string>());
  }
  upsertMessageNotification(input: UpsertMessageNotificationInput): Promise<string> {
    this.notifications.push(input);
    return Promise.resolve(oid(900));
  }
  upsertRecipients(input: UpsertRecipientsInput): Promise<RecipientUpsertResult[]> {
    return Promise.resolve(
      input.rows.map((r) => {
        const existing = this.rows.get(r.userId);
        if (!existing) {
          const id = oid(1000 + this.rows.size);
          this.rows.set(r.userId, {
            id, userId: r.userId, kind: r.kind, kindRank: r.kindRank, readAt: null, deliveredPushAt: null, inInbox: true,
            rowKind: r.kind, filterBucket: r.filterBucket,
          });
          return { userId: r.userId, recipientRowId: id, created: true, upgraded: false };
        }
        const higher = existing.kindRank < r.kindRank;
        if (higher) Object.assign(existing, { kind: r.kind, kindRank: r.kindRank, filterBucket: r.filterBucket });
        return { userId: r.userId, recipientRowId: existing.id, created: false, upgraded: higher };
      })
    );
  }
  findRecipientRows(_key: string, userIds: string[]): Promise<ExistingRecipientRow[]> {
    return Promise.resolve(userIds.map((u) => this.rows.get(u)).filter((r): r is NonNullable<typeof r> => !!r));
  }
  listRecipientRows(): Promise<ExistingRecipientRow[]> {
    return Promise.resolve([...this.rows.values()]);
  }
  cancelRecipients(ids: string[]): Promise<void> {
    this.cancelled.push(...ids);
    for (const r of this.rows.values()) if (ids.includes(r.id)) r.inInbox = false;
    return Promise.resolve();
  }
  setPushOutcome(_key: string, userId: string, outcome: { status: "SENT" | "SKIPPED" | "FAILED"; skipReason?: string }): Promise<void> {
    this.outcomes.push({ userId, ...outcome });
    return Promise.resolve();
  }
  getLastReadSeq(): Promise<number> {
    return Promise.resolve(0);
  }
  countUnreadInStream(): Promise<number> {
    return Promise.resolve(0);
  }
}

function makeMessage(over: Partial<FanoutMessage> = {}): FanoutMessage {
  return {
    id: MSG, scopeType: "CHANNEL", scopeId: CH, workspaceId: WS, threadId: null, seq: 5, authorId: AUTHOR, kind: "USER",
    systemType: null, content: "hi", mentions: [], attachments: [], deletedAt: null, createdAt: new Date(), ...over,
  };
}

interface Harness {
  deps: FanoutDeps;
  repo: FakeRepo;
  pushed: PushTarget[];
  emitted: { userIds: string[]; event: string; payload: Record<string, unknown> }[];
  suppressed: string[];
  viewing: Set<string>;
  blockers: Set<string>;
  prefs: Map<string, EffectiveMessagePreference>;
  audience: string[];
  subscribers: string[];
  wasPushed: Set<string>;
}

function makeHarness(message: FanoutMessage | null, over: { audience?: string[] } = {}): Harness {
  const repo = new FakeRepo(message);
  const h: Harness = {
    repo, pushed: [], emitted: [], suppressed: [], viewing: new Set(), blockers: new Set(), prefs: new Map(),
    audience: over.audience ?? [AUTHOR, U2, U3, U4, U5], subscribers: [], wasPushed: new Set(),
    deps: undefined as unknown as FanoutDeps,
  };
  h.deps = {
    repo,
    prefs: {
      resolveMany: (_scope: unknown, userIds: string[]) =>
        Promise.resolve(new Map(userIds.map((u) => [u, h.prefs.get(u) ?? pref()]))),
      resolveOne: () => Promise.resolve(pref()),
    } as unknown as FanoutDeps["prefs"],
    readers: () => Promise.resolve(h.audience),
    threadSubscribers: () => Promise.resolve(h.subscribers),
    blockersOf: (_a, userIds) => Promise.resolve(new Set(userIds.filter((u) => h.blockers.has(u)))),
    isViewing: (userId) => Promise.resolve(h.viewing.has(userId)),
    wasPushed: (_m, userId) => Promise.resolve(h.wasPushed.has(userId)),
    pushEnabled: () => Promise.resolve(true),
    dispatch: {
      enqueueMany: (targets) => {
        h.pushed.push(...targets);
        return Promise.resolve();
      },
    },
    emitToUsers: (userIds, event, payload) => {
      h.emitted.push({ userIds, event, payload: payload as Record<string, unknown> });
    },
    invalidateSummary: () => Promise.resolve(),
    record: { suppressed: (r) => void h.suppressed.push(r), fanoutSeconds: () => undefined, inboxCreated: () => undefined },
    chunkSize: 500,
  };
  return h;
}

describe("FanoutService.fanoutMessage", () => {
  it("NT-01: 2 mention cùng người + người đó theo dõi thread → MỘT mục MENTION, MỘT push, MỘT notification:created", async () => {
    const msg = makeMessage({
      scopeId: CH, threadId: THREAD,
      mentions: [{ type: "USER", targetId: U2, label: "U2" }, { type: "USER", targetId: U2, label: "U2" }],
    });
    const h = makeHarness(msg);
    h.subscribers = [U2, U3];
    // kênh mặc định MENTIONS → chỉ người có lý do mới push
    for (const u of [U2, U3, U4, U5]) h.prefs.set(u, pref({ mode: "MENTIONS" }));

    const svc = new FanoutService(h.deps);
    await svc.fanoutMessage({ messageId: MSG, mentionUserIds: [U2, U2] });

    expect(h.repo.rows.get(U2)).toMatchObject({ rowKind: "MENTION", filterBucket: "mentions" });
    expect(h.repo.rows.get(U3)).toMatchObject({ rowKind: "THREAD_REPLY", filterBucket: "following" });
    expect(h.repo.rows.size).toBe(2);
    expect(h.repo.notifications).toHaveLength(1);
    expect(h.repo.notifications[0]?.dedupeKey).toBe(`msg:${MSG}`);
    expect(h.repo.notifications[0]?.type).toBe("mention");

    const created = h.emitted.filter((e) => e.event === String(SocketEvent.NOTIFICATION_CREATED));
    expect(created.map((e) => e.userIds[0]).sort()).toEqual([U2, U3].sort());
    expect(created.find((e) => e.userIds[0] === U2)?.payload).toMatchObject({ kind: "MENTION", messageId: MSG, scopeType: "CHANNEL" });

    // Đúng MỘT push cho U2 (lý do MENTION) và MỘT cho U3 (THREAD_REPLY); người không có lý do không push.
    expect(h.pushed.filter((t) => t.userId === U2)).toHaveLength(1);
    expect(h.pushed.find((t) => t.userId === U2)?.reason).toBe("MENTION");
    expect(h.pushed.find((t) => t.userId === U3)?.reason).toBe("THREAD_REPLY");
    expect(h.pushed.some((t) => t.userId === U4 || t.userId === U5)).toBe(false);

    // Job chạy lại: mục hộp thư KHÔNG nhân đôi, notification:created KHÔNG phát lại (push trùng do dispatch chặn).
    await svc.fanoutMessage({ messageId: MSG, mentionUserIds: [U2, U2] });
    expect(h.repo.rows.size).toBe(2);
    expect(h.emitted.filter((e) => e.event === String(SocketEvent.NOTIFICATION_CREATED))).toHaveLength(2);
  });

  it("MENTION thắng THREAD_REPLY/FIRST_REPLY; FIRST_REPLY chỉ tác giả tin gốc", async () => {
    const msg = makeMessage({ threadId: THREAD, mentions: [{ type: "USER", targetId: U2, label: "x" }] });
    const h = makeHarness(msg);
    h.subscribers = [U2, U3, U4];
    const svc = new FanoutService(h.deps);
    await svc.fanoutMessage({ messageId: MSG, mentionUserIds: [U2], isFirstReply: true, parentAuthorId: U3 });

    expect(h.repo.rows.get(U2)?.rowKind).toBe("MENTION");
    expect(h.repo.rows.get(U3)?.rowKind).toBe("FIRST_REPLY");
    expect(h.repo.rows.get(U4)?.rowKind).toBe("THREAD_REPLY");
    expect(h.repo.rows.has(U5)).toBe(false); // không theo dõi → không có mục hộp thư
  });

  it("@all: mọi người trong audience là MENTION, tác giả bị loại", async () => {
    const msg = makeMessage({ mentions: [{ type: "ALL", targetId: null, label: null }] });
    const h = makeHarness(msg);
    const svc = new FanoutService(h.deps);
    const stats = await svc.fanoutMessage({ messageId: MSG, mentionAll: true, mentionUserIds: [] });

    expect(stats.audience).toBe(4);
    expect([...h.repo.rows.keys()].sort()).toEqual([U2, U3, U4, U5].sort());
    expect(h.repo.rows.has(AUTHOR)).toBe(false);
    expect(h.pushed.every((t) => t.reason === "MENTION" && t.userId !== AUTHOR)).toBe(true);
  });

  it("kênh mặc định MENTIONS_AND_THREADS: tin thường KHÔNG push, KHÔNG có mục hộp thư", async () => {
    const h = makeHarness(makeMessage());
    for (const u of [U2, U3, U4, U5]) h.prefs.set(u, pref({ mode: "MENTIONS" }));
    const stats = await new FanoutService(h.deps).fanoutMessage({ messageId: MSG, mentionUserIds: [] });

    expect(h.pushed).toHaveLength(0);
    expect(h.repo.rows.size).toBe(0);
    expect(h.repo.notifications).toHaveLength(0); // không có lý do chú ý → không tạo Notification gốc
    expect(stats.suppressed.mode).toBe(4);
  });

  it("1-1/nhóm mặc định ALL: tin thường push cho mọi người, không có mục hộp thư", async () => {
    const msg = makeMessage({ scopeType: "CONVERSATION", scopeId: CONV });
    const h = makeHarness(msg, { audience: [AUTHOR, U2] });
    h.repo.meta = { workspaceId: null, conversationKind: "DIRECT", name: null, restricted: false };
    await new FanoutService(h.deps).fanoutMessage({ messageId: MSG, mentionUserIds: [] });

    expect(h.pushed).toHaveLength(1);
    expect(h.pushed[0]).toMatchObject({ userId: U2, reason: "MESSAGE", scopeKey: `CONVERSATION:${CONV}`, seq: 5, authorId: AUTHOR });
    expect(h.repo.rows.size).toBe(0);
  });

  it("NT-04: người MUTED được tag → CÓ mục hộp thư, KHÔNG push (lý do muted ghi lên mục)", async () => {
    const msg = makeMessage({ mentions: [{ type: "USER", targetId: U2, label: "U2" }] });
    const h = makeHarness(msg);
    h.prefs.set(U2, pref({ mode: "MUTED" }));
    await new FanoutService(h.deps).fanoutMessage({ messageId: MSG, mentionUserIds: [U2] });

    expect(h.repo.rows.get(U2)).toBeDefined();
    expect(h.pushed.some((t) => t.userId === U2)).toBe(false);
    expect(h.repo.outcomes).toContainEqual({ userId: U2, status: "SKIPPED", skipReason: "MUTED" });
  });

  it("NT-04: DND cũng chặn push nhưng vẫn có mục hộp thư", async () => {
    const msg = makeMessage({ mentions: [{ type: "USER", targetId: U2, label: "U2" }] });
    const h = makeHarness(msg);
    h.prefs.set(U2, pref({ dnd: true }));
    await new FanoutService(h.deps).fanoutMessage({ messageId: MSG, mentionUserIds: [U2] });

    expect(h.repo.rows.has(U2)).toBe(true);
    expect(h.pushed.some((t) => t.userId === U2)).toBe(false);
    expect(h.repo.outcomes).toContainEqual({ userId: U2, status: "SKIPPED", skipReason: "DND" });
  });

  it("NT-09: đang xem đúng luồng (viewing) → không push", async () => {
    const msg = makeMessage({ scopeType: "CONVERSATION", scopeId: CONV });
    const h = makeHarness(msg, { audience: [AUTHOR, U2, U3] });
    h.viewing.add(U2);
    await new FanoutService(h.deps).fanoutMessage({ messageId: MSG, mentionUserIds: [] });

    expect(h.pushed.map((t) => t.userId)).toEqual([U3]);
    expect(h.suppressed).toContain("viewing");
  });

  it("NT-14: người đã chặn tác giả — không push VÀ không có mục hộp thư mention", async () => {
    const msg = makeMessage({ scopeType: "CONVERSATION", scopeId: CONV, mentions: [{ type: "USER", targetId: U2, label: "U2" }] });
    const h = makeHarness(msg, { audience: [AUTHOR, U2, U3] });
    h.blockers.add(U2);
    await new FanoutService(h.deps).fanoutMessage({ messageId: MSG, mentionUserIds: [U2] });

    expect(h.pushed.map((t) => t.userId)).toEqual([U3]);
    expect(h.repo.rows.has(U2)).toBe(false);
    expect(h.suppressed).toContain("blocked");
  });

  it("bỏ qua: tin không tồn tại / đã thu hồi / tin hệ thống / không có audience", async () => {
    expect((await new FanoutService(makeHarness(null).deps).fanoutMessage({ messageId: MSG })).skipped).toBe("not-found");
    expect((await new FanoutService(makeHarness(makeMessage({ deletedAt: new Date() })).deps).fanoutMessage({ messageId: MSG })).skipped).toBe("deleted");
    expect(
      (await new FanoutService(makeHarness(makeMessage({ kind: "SYSTEM", systemType: "MEMBER_JOINED", authorId: null })).deps).fanoutMessage({ messageId: MSG })).skipped
    ).toBe("system");
    expect((await new FanoutService(makeHarness(makeMessage(), { audience: [AUTHOR] }).deps).fanoutMessage({ messageId: MSG })).skipped).toBe("no-audience");
  });

  it("chia lô theo chunkSize (không xử lý một cục)", async () => {
    const many = Array.from({ length: 1200 }, (_, i) => oid(10_000 + i));
    const msg = makeMessage({ scopeType: "CONVERSATION", scopeId: CONV });
    const h = makeHarness(msg, { audience: [AUTHOR, ...many] });
    const batches: number[] = [];
    h.deps.dispatch = {
      enqueueMany: (targets) => {
        batches.push(targets.length);
        return Promise.resolve();
      },
    };
    await new FanoutService({ ...h.deps, chunkSize: 500 }).fanoutMessage({ messageId: MSG, mentionUserIds: [] });
    expect(batches).toEqual([500, 500, 200]);
  });
});

describe("FanoutEditService.fanoutMessageEdit (MSG-33)", () => {
  const editMsg = (): FanoutMessage => makeMessage({ mentions: [{ type: "USER", targetId: U2, label: "U2" }] });

  it("thêm người nhắc tên: tạo mục MENTION + push (người chưa nhận push của tin này)", async () => {
    const h = makeHarness(editMsg());
    const stats = await new FanoutEditService(h.deps).fanoutMessageEdit({ messageId: MSG, addedUserIds: [U2], removedUserIds: [] });

    expect(stats.added).toBe(1);
    expect(h.repo.rows.get(U2)?.rowKind).toBe("MENTION");
    expect(h.pushed.map((t) => t.userId)).toEqual([U2]);
    expect(h.emitted.some((e) => e.event === String(SocketEvent.NOTIFICATION_CREATED))).toBe(true);
  });

  it("người đã nhận push của tin này (wasPushed) → có mục hộp thư nhưng KHÔNG push lại", async () => {
    const h = makeHarness(editMsg());
    h.wasPushed.add(U2);
    await new FanoutEditService(h.deps).fanoutMessageEdit({ messageId: MSG, addedUserIds: [U2], removedUserIds: [] });
    expect(h.repo.rows.has(U2)).toBe(true);
    expect(h.pushed).toHaveLength(0);
  });

  it("gỡ nhắc tên: huỷ mục MENTION chưa đọc, phát notification:read { ids }", async () => {
    const h = makeHarness(editMsg());
    const svc = new FanoutEditService(h.deps);
    await svc.fanoutMessageEdit({ messageId: MSG, addedUserIds: [U2], removedUserIds: [] });
    const rowId = h.repo.rows.get(U2)?.id;
    h.emitted.length = 0;

    const stats = await svc.fanoutMessageEdit({ messageId: MSG, addedUserIds: [], removedUserIds: [U2] });
    expect(stats.cancelled).toBe(1);
    expect(h.repo.cancelled).toEqual([rowId]);
    expect(h.emitted).toEqual([{ userIds: [U2], event: SocketEvent.NOTIFICATION_READ, payload: { ids: [rowId] } }]);
  });

  it("gỡ nhắc tên nhưng người đó vẫn theo dõi thread → giữ mục (còn lý do khác)", async () => {
    const msg = makeMessage({ threadId: THREAD, mentions: [{ type: "USER", targetId: U2, label: "U2" }] });
    const h = makeHarness(msg);
    h.subscribers = [U2];
    const svc = new FanoutEditService(h.deps);
    await svc.fanoutMessageEdit({ messageId: MSG, addedUserIds: [U2], removedUserIds: [] });
    const stats = await svc.fanoutMessageEdit({ messageId: MSG, addedUserIds: [], removedUserIds: [U2] });
    expect(stats.cancelled).toBe(0);
    expect(h.repo.rows.get(U2)?.inInbox).toBe(true);
  });

  it("mục đã đọc không bị huỷ", async () => {
    const h = makeHarness(editMsg());
    const svc = new FanoutEditService(h.deps);
    await svc.fanoutMessageEdit({ messageId: MSG, addedUserIds: [U2], removedUserIds: [] });
    (h.repo.rows.get(U2) as { readAt: Date | null }).readAt = new Date();
    const stats = await svc.fanoutMessageEdit({ messageId: MSG, addedUserIds: [], removedUserIds: [U2] });
    expect(stats.cancelled).toBe(0);
  });

  it("người bị chặn tác giả không được thêm mục mention; người ngoài audience bị bỏ", async () => {
    const h = makeHarness(editMsg());
    h.blockers.add(U2);
    const stats = await new FanoutEditService(h.deps).fanoutMessageEdit({
      messageId: MSG, addedUserIds: [U2, oid(999)], removedUserIds: [],
    });
    expect(stats.added).toBe(0);
    expect(h.repo.rows.size).toBe(0);
  });
});
