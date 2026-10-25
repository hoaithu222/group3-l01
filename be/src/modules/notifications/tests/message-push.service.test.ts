import { MessagePushService, type MessagePushDeps } from "../services/message-push.service";
import type { CoalescedPushJobData, MessagePushJobData, PushSkipReason } from "../entities/message-notification.types";
import type {
  ExistingRecipientRow,
  FanoutMessage,
  FanoutScopeMeta,
  IFanoutRepository,
} from "../repositories/fanout.repository.interface";
import type { EffectiveMessagePreference } from "../services/preference-matrix";
import type { PushPayload } from "../../../infrastructure/push";

const oid = (n: number): string => `64b${String(n).padStart(21, "0")}`;
const [AUTHOR, B, CONV, MSG, CH] = [oid(1), oid(2), oid(200), oid(300), oid(100)];

const pref = (over: Partial<EffectiveMessagePreference> = {}): EffectiveMessagePreference => ({
  mode: "ALL", dnd: false, lockScreenPreview: "HIDDEN", sound: true, ...over,
});

function message(over: Partial<FanoutMessage> = {}): FanoutMessage {
  return {
    id: MSG, scopeType: "CONVERSATION", scopeId: CONV, workspaceId: null, threadId: null, seq: 7, authorId: AUTHOR,
    kind: "USER", systemType: null, content: "Chiều nay họp lúc 3h", mentions: [], attachments: [], deletedAt: null,
    createdAt: new Date(), ...over,
  };
}

interface Rig {
  svc: MessagePushService;
  sent: { tokens: string[]; payload: PushPayload }[];
  outcomes: { dedupeKey: string; userId: string; status: string; skipReason?: string }[];
  cancelled: string[];
  recorded: { sent: string[]; suppressed: PushSkipReason[] };
  markPushed: string[];
  state: {
    msg: FanoutMessage | null; canRead: boolean; lastRead: number; tokens: string[]; blocked: boolean; viewing: boolean;
    pushEnabled: boolean; pref: EffectiveMessagePreference; meta: FanoutScopeMeta; names: Map<string, string>;
    pending: { count: number; last: { messageId: string; seq: number; reason: "MESSAGE" | "MENTION"; authorId: string } | null };
    successCount: number; invalid: string[];
  };
  revoked: string[][];
}

function makeRig(): Rig {
  const state: Rig["state"] = {
    msg: message(), canRead: true, lastRead: 0, tokens: ["tok1"], blocked: false, viewing: false, pushEnabled: true,
    pref: pref(), meta: { workspaceId: null, conversationKind: "DIRECT", name: null, restricted: false },
    names: new Map([[AUTHOR, "Minh"]]), pending: { count: 0, last: null }, successCount: 1, invalid: [],
  };
  const rig = {
    sent: [], outcomes: [], cancelled: [], recorded: { sent: [], suppressed: [] }, markPushed: [], revoked: [], state,
  } as unknown as Rig;

  const repo: IFanoutRepository = {
    findMessage: () => Promise.resolve(state.msg),
    loadScopeMeta: () => Promise.resolve(state.meta),
    loadUserNames: () => Promise.resolve(state.names),
    upsertMessageNotification: () => Promise.resolve(""),
    upsertRecipients: () => Promise.resolve([]),
    findRecipientRows: (): Promise<ExistingRecipientRow[]> =>
      Promise.resolve([{ id: oid(777), userId: B, kind: "MENTION", kindRank: 100, readAt: null, deliveredPushAt: null, inInbox: true }]),
    listRecipientRows: () => Promise.resolve([]),
    cancelRecipients: (ids) => {
      rig.cancelled.push(...ids);
      return Promise.resolve();
    },
    setPushOutcome: (dedupeKey, userId, o) => {
      rig.outcomes.push({ dedupeKey, userId, ...o });
      return Promise.resolve();
    },
    getLastReadSeq: () => Promise.resolve(state.lastRead),
    countUnreadInStream: () => Promise.resolve(0),
  };
  const deps: MessagePushDeps = {
    repo,
    prefs: { resolveOne: () => Promise.resolve(state.pref), resolveMany: () => Promise.resolve(new Map()) } as unknown as MessagePushDeps["prefs"],
    pushEnabled: () => Promise.resolve(state.pushEnabled),
    canReadScope: () => Promise.resolve(state.canRead),
    hasBlockedAuthor: () => Promise.resolve(state.blocked),
    isViewing: () => Promise.resolve(state.viewing),
    getFcmTokens: () => Promise.resolve(state.tokens),
    revokeTokens: (t) => {
      rig.revoked.push(t);
      return Promise.resolve();
    },
    sender: () => ({
      sendMulticast: (tokens, payload) => {
        rig.sent.push({ tokens, payload });
        return Promise.resolve({ successCount: state.successCount, invalidTokens: state.invalid });
      },
    }),
    badgeFor: () => Promise.resolve(3),
    markPushed: (m) => {
      rig.markPushed.push(m);
      return Promise.resolve();
    },
    takePending: () => Promise.resolve(state.pending),
    record: {
      sent: (type, status) => void rig.recorded.sent.push(`${type}:${status}`),
      suppressed: (r) => void rig.recorded.suppressed.push(r),
    },
    now: () => new Date("2026-09-19T10:00:00.000Z"),
  };
  rig.svc = new MessagePushService(deps);
  return rig;
}

const job = (over: Partial<MessagePushJobData> = {}): MessagePushJobData => ({
  kind: "message", userId: B, messageId: MSG, scopeType: "CONVERSATION", scopeId: CONV, threadId: null,
  scopeKey: `CONVERSATION:${CONV}`, reason: "MESSAGE", seq: 7, authorId: AUTHOR, ...over,
});

describe("MessagePushService.sendMessage — kiểm lại NGAY TRƯỚC KHI GỬI", () => {
  it("đủ điều kiện → gửi FCM, badge, payload HIDDEN mặc định, ghi markPushed + metric", async () => {
    const rig = makeRig();
    const out = await rig.svc.sendMessage(job());

    expect(out).toEqual({ status: "SENT", tokens: 1 });
    expect(rig.sent).toHaveLength(1);
    expect(rig.sent[0]?.tokens).toEqual(["tok1"]);
    expect(rig.sent[0]?.payload).toMatchObject({
      type: "message.new", targetUserId: B, scopeId: CONV, badge: 3, body: "Bạn có tin nhắn mới", title: "Super App",
    });
    expect(rig.markPushed).toEqual([MSG]);
    expect(rig.recorded.sent).toEqual(["message.new:sent"]);
  });

  it("NT-05: mất quyền đọc trước khi job chạy → bỏ, huỷ mục hộp thư, không gửi", async () => {
    const rig = makeRig();
    rig.state.canRead = false;
    const out = await rig.svc.sendMessage(job({ reason: "MENTION" }));

    expect(out).toEqual({ status: "SKIPPED", reason: "revoked" });
    expect(rig.sent).toHaveLength(0);
    expect(rig.cancelled).toEqual([oid(777)]);
    expect(rig.recorded.suppressed).toContain("revoked");
  });

  it("đã đọc (lastReadSeq ≥ seq của tin) → bỏ", async () => {
    const rig = makeRig();
    rig.state.lastRead = 7;
    expect(await rig.svc.sendMessage(job())).toEqual({ status: "SKIPPED", reason: "read" });
    rig.state.lastRead = 6;
    expect((await rig.svc.sendMessage(job())).status).toBe("SENT");
  });

  it("tin đã thu hồi hoặc không còn → bỏ (không lộ nội dung cũ)", async () => {
    const rig = makeRig();
    rig.state.msg = message({ deletedAt: new Date() });
    expect(await rig.svc.sendMessage(job())).toEqual({ status: "SKIPPED", reason: "recalled" });
    rig.state.msg = null;
    expect(await rig.svc.sendMessage(job())).toEqual({ status: "SKIPPED", reason: "recalled" });
    expect(rig.sent).toHaveLength(0);
  });

  it("mute/DND đổi trong lúc chờ → bỏ; mention bị MUTED ghi SKIPPED MUTED lên mục hộp thư (NT-04)", async () => {
    const rig = makeRig();
    rig.state.pref = pref({ mode: "MUTED" });
    expect(await rig.svc.sendMessage(job({ reason: "MENTION" }))).toEqual({ status: "SKIPPED", reason: "muted" });
    expect(rig.outcomes).toContainEqual({ dedupeKey: `msg:${MSG}`, userId: B, status: "SKIPPED", skipReason: "MUTED" });

    rig.state.pref = pref({ dnd: true });
    expect(await rig.svc.sendMessage(job())).toEqual({ status: "SKIPPED", reason: "dnd" });
  });

  it("NT-09: mở đúng hội thoại ở foreground trong lúc chờ → bỏ; NT-14: đã chặn tác giả → bỏ", async () => {
    const rig = makeRig();
    rig.state.viewing = true;
    expect(await rig.svc.sendMessage(job())).toEqual({ status: "SKIPPED", reason: "viewing" });
    rig.state.viewing = false;
    rig.state.blocked = true;
    expect(await rig.svc.sendMessage(job())).toEqual({ status: "SKIPPED", reason: "blocked" });
  });

  it("cờ push tắt → bỏ (inbox/unread vẫn chạy — NT-06)", async () => {
    const rig = makeRig();
    rig.state.pushEnabled = false;
    expect(await rig.svc.sendMessage(job())).toEqual({ status: "SKIPPED", reason: "disabled" });
  });

  it("không có token → skip no-token, không gọi sender", async () => {
    const rig = makeRig();
    rig.state.tokens = [];
    expect(await rig.svc.sendMessage(job())).toEqual({ status: "SKIPPED", reason: "no-token" });
    expect(rig.sent).toHaveLength(0);
  });

  it("token chết trả về từ FCM → thu hồi token; không thành công nào → FAILED và không markPushed", async () => {
    const rig = makeRig();
    rig.state.successCount = 0;
    rig.state.invalid = ["tok1"];
    const out = await rig.svc.sendMessage(job());
    expect(out.status).toBe("FAILED");
    expect(rig.revoked).toEqual([["tok1"]]);
    expect(rig.markPushed).toEqual([]);
    expect(rig.recorded.sent).toEqual(["message.new:failed"]);
  });

  it("NT-10: FULL ở kênh riêng tư bị hạ xuống SENDER; FULL 1-1 hiện trích đoạn", async () => {
    const rig = makeRig();
    rig.state.pref = pref({ lockScreenPreview: "FULL" });
    await rig.svc.sendMessage(job());
    expect(rig.sent[0]?.payload.body).toBe("Chiều nay họp lúc 3h");
    expect(rig.sent[0]?.payload.title).toBe("Minh");

    const priv = makeRig();
    priv.state.pref = pref({ lockScreenPreview: "FULL" });
    priv.state.msg = message({ scopeType: "CHANNEL", scopeId: CH });
    priv.state.meta = { workspaceId: oid(500), name: "ban-giam-doc", restricted: true };
    await priv.svc.sendMessage(job({ scopeType: "CHANNEL", scopeId: CH, scopeKey: `CHANNEL:${CH}` }));
    expect(priv.sent[0]?.payload.title).toBe("#ban-giam-doc");
    expect(priv.sent[0]?.payload.body).toBe("Minh: đã gửi tin nhắn");
    expect(JSON.stringify(priv.sent[0]?.payload)).not.toContain("họp lúc 3h");
  });

  it("push trong thread: data.threadId = id tin gốc (Message.threadId) và data.rootMessageId cùng giá trị", async () => {
    const THREAD = oid(300); // = Message.threadId = id TIN GỐC
    const rig = makeRig();
    rig.state.msg = message({ scopeType: "CHANNEL", scopeId: CH, threadId: THREAD });
    rig.state.meta = { workspaceId: oid(500), name: "kenh", restricted: false };
    await rig.svc.sendMessage(
      job({ scopeType: "CHANNEL", scopeId: CH, threadId: THREAD, scopeKey: `CHANNEL:${CH}:${THREAD}`, reason: "THREAD_REPLY" })
    );
    expect(rig.sent[0]?.payload).toMatchObject({ type: "thread.reply", androidChannel: "mentions", targetUserId: B });
    expect(rig.sent[0]?.payload.data).toMatchObject({ threadId: THREAD, rootMessageId: THREAD });

    // Ngoài thread: không có khoá
    const plain = makeRig();
    await plain.svc.sendMessage(job());
    expect(plain.sent[0]?.payload.data["rootMessageId"]).toBeUndefined();
  });

  it("mention thành công → ghi SENT + deliveredPushAt lên mục hộp thư; tin thường không ghi", async () => {
    const rig = makeRig();
    await rig.svc.sendMessage(job({ reason: "MENTION" }));
    expect(rig.outcomes).toContainEqual(expect.objectContaining({ dedupeKey: `msg:${MSG}`, userId: B, status: "SENT" }));

    const plain = makeRig();
    await plain.svc.sendMessage(job({ reason: "MESSAGE" }));
    expect(plain.outcomes).toHaveLength(0);
  });
});

describe("MessagePushService.sendCoalesced (NT-08)", () => {
  const cjob = (): CoalescedPushJobData => ({
    kind: "message-coalesced", userId: B, scopeType: "CONVERSATION", scopeId: CONV, threadId: null,
    scopeKey: `CONVERSATION:${CONV}`, windowStart: 1,
  });

  it("4 tin chờ → 1 push '4 tin nhắn mới' trỏ tin mới nhất", async () => {
    const rig = makeRig();
    rig.state.pending = { count: 4, last: { messageId: MSG, seq: 7, reason: "MESSAGE", authorId: AUTHOR } };
    const out = await rig.svc.sendCoalesced(cjob());

    expect(out).toMatchObject({ status: "SENT" });
    expect(rig.sent[0]?.payload.body).toBe("4 tin nhắn mới");
    expect(rig.sent[0]?.payload.data).toMatchObject({ messageId: MSG, count: "4" });
  });

  it("bộ đếm rỗng (đã bị xoá/đã gửi) → 'empty', không gửi", async () => {
    const rig = makeRig();
    expect(await rig.svc.sendCoalesced(cjob())).toBe("empty");
    expect(rig.sent).toHaveLength(0);
  });

  it("người nhận đã đọc hết trong lúc chờ → bỏ", async () => {
    const rig = makeRig();
    rig.state.pending = { count: 3, last: { messageId: MSG, seq: 7, reason: "MESSAGE", authorId: AUTHOR } };
    rig.state.lastRead = 7;
    expect(await rig.svc.sendCoalesced(cjob())).toEqual({ status: "SKIPPED", reason: "read" });
  });
});
