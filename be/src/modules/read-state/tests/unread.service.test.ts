import { UnreadService, isConversationMuted } from "../services/unread.service";
import type { IUnreadRepository } from "../repositories/unread.repository.interface";
import type {
  ConversationUnreadRow,
  InboxCounts,
  JoinedChannelRow,
  SubscribedThreadRow,
} from "../entities/read-state.interface";
import type { UnreadCache } from "../services/unread-cache";

const oid = (n: number): string => `64b${String(n).padStart(21, "0")}`;
const [ME, WS1, WS2, CH1, CH2, CH3, TH1, TH2] = [oid(1), oid(10), oid(11), oid(100), oid(101), oid(102), oid(300), oid(301)];
const NOW = new Date("2026-09-19T10:00:00.000Z");

class FakeCache {
  store = new Map<string, unknown>();
  gets = 0;
  summaryKey = (u: string): string => `unread:summary:${u}`;
  channelKey = (u: string, c: string): string => `unread:ch:${u}:${c}`;
  get<T>(key: string): Promise<T | null> {
    this.gets += 1;
    return Promise.resolve((this.store.get(key) as T | undefined) ?? null);
  }
  set(key: string, value: object): Promise<void> {
    this.store.set(key, value);
    return Promise.resolve();
  }
}

interface Data {
  conversations: ConversationUnreadRow[];
  workspaces: string[];
  /** Nhóm nào trong `workspaces` đang mute CẢ NHÓM (`WorkspaceMembership.notifyMode = MUTED`). */
  mutedWorkspaces: string[];
  channels: JoinedChannelRow[];
  channelReads: Record<string, number>;
  threadReads: Record<string, number>;
  inbox: InboxCounts;
  channelMentions: Record<string, number>;
  threads: SubscribedThreadRow[];
  channelUnreadCalls: string[];
  channelUnread: Record<string, number>;
}

function makeRepo(over: Partial<Data> = {}): { repo: IUnreadRepository; data: Data } {
  const data: Data = {
    conversations: [], workspaces: [WS1], mutedWorkspaces: [], channels: [], channelReads: {}, threadReads: {},
    inbox: { unread: 0, mentions: 0, mentionsByWorkspace: new Map() }, channelMentions: {}, threads: [],
    channelUnreadCalls: [], channelUnread: {}, ...over,
  };
  const repo: IUnreadRepository = {
    conversationRows: () => Promise.resolve(data.conversations),
    activeWorkspaceIds: () =>
      Promise.resolve(
        data.workspaces.map((workspaceId) => ({
          workspaceId,
          notifyMode: data.mutedWorkspaces.includes(workspaceId) ? "MUTED" : "INHERIT",
        })),
      ),
    joinedChannels: (_u, wsIds) => Promise.resolve(data.channels.filter((c) => wsIds.includes(c.workspaceId))),
    readSeqs: (_u, type, ids) =>
      Promise.resolve(new Map(ids.filter((id) => (type === "CHANNEL" ? data.channelReads : data.threadReads)[id] !== undefined).map((id) => [id, (type === "CHANNEL" ? data.channelReads : data.threadReads)[id] as number]))),
    inboxCounts: () => Promise.resolve(data.inbox),
    countChannelUnread: (_u, channelId, _after, cap) => {
      data.channelUnreadCalls.push(channelId);
      return Promise.resolve(Math.min(data.channelUnread[channelId] ?? 0, cap));
    },
    channelMentionCounts: () => Promise.resolve(new Map(Object.entries(data.channelMentions))),
    subscribedThreads: () => Promise.resolve(data.threads),
  };
  return { repo, data };
}

const conv = (over: Partial<ConversationUnreadRow>): ConversationUnreadRow => ({
  unreadCount: 0, markedUnread: false, mentionsSinceRead: 0, notifyMode: "INHERIT", mutedUntil: null, ...over,
});

describe("UnreadService.summary", () => {
  it("hội thoại: unreadConversations loại MUTED/mutedUntil; unreadMessages KHÔNG loại muted; mentions đếm hội thoại", async () => {
    const { repo } = makeRepo({
      conversations: [
        conv({ unreadCount: 3, mentionsSinceRead: 1 }),
        conv({ unreadCount: 5, notifyMode: "MUTED" }),
        conv({ unreadCount: 2, mutedUntil: new Date(NOW.getTime() + 3_600_000) }),
        conv({ unreadCount: 4, mutedUntil: new Date(NOW.getTime() - 1000) }), // hết hạn tắt tiếng → tính
        conv({ markedUnread: true }),
      ],
    });
    const s = await new UnreadService(repo, new FakeCache() as unknown as UnreadCache, () => NOW).summary(ME);

    expect(s.conversations).toEqual({ unreadConversations: 3, unreadMessages: 14, mentions: 1 });
    expect(s.computedAt).toBe(NOW.toISOString());
  });

  it("badgeTotal = unreadConversations + activity.unread (NT-15: đọc 2/3 hội thoại rồi +1 push → 1 + 1)", async () => {
    const { repo, data } = makeRepo({ conversations: [conv({ unreadCount: 1 })], inbox: { unread: 1, mentions: 1, mentionsByWorkspace: new Map([[WS1, 1]]) } });
    const svc = new UnreadService(repo, new FakeCache() as unknown as UnreadCache, () => NOW);
    const s = await svc.summary(ME);
    expect(s.activity).toEqual({ unread: 1, mentions: 1 });
    expect(s.badgeTotal).toBe(2);
    data.conversations = [];
    expect((await svc.summary(ME, { fresh: true })).badgeTotal).toBe(1);
  });

  it("workspace: unreadChannels đếm kênh có lastSeq > mốc đọc (không đếm tin), loại kênh MUTED; mentions từ hộp thư", async () => {
    const { repo } = makeRepo({
      workspaces: [WS1, WS2],
      channels: [
        { channelId: CH1, workspaceId: WS1, lastSeq: 10, notifyMode: "INHERIT" }, // 10 > 4 → chưa đọc
        { channelId: CH2, workspaceId: WS1, lastSeq: 7, notifyMode: "INHERIT" }, // 7 = 7 → đã đọc
        { channelId: CH3, workspaceId: WS1, lastSeq: 50, notifyMode: "MUTED" }, // muted → không tính
      ],
      channelReads: { [CH1]: 4, [CH2]: 7 },
      inbox: { unread: 2, mentions: 2, mentionsByWorkspace: new Map([[WS1, 2]]) },
    });
    const s = await new UnreadService(repo, new FakeCache() as unknown as UnreadCache, () => NOW).summary(ME);
    expect(s.workspaces).toEqual([
      { workspaceId: WS1, unreadChannels: 1, mentions: 2 },
      { workspaceId: WS2, unreadChannels: 0, mentions: 0 },
    ]);
  });

  it("kênh chưa có ReadState (chưa từng mở) mà đã có tin → tính là chưa đọc", async () => {
    const { repo } = makeRepo({ channels: [{ channelId: CH1, workspaceId: WS1, lastSeq: 3, notifyMode: "INHERIT" }] });
    const s = await new UnreadService(repo, new FakeCache() as unknown as UnreadCache, () => NOW).summary(ME);
    expect(s.workspaces[0]?.unreadChannels).toBe(1);
  });

  it("cache 10 s: lần 2 lấy từ cache (không truy vấn lại); fresh bỏ qua cache", async () => {
    const { repo, data } = makeRepo({ conversations: [conv({ unreadCount: 1 })] });
    const cache = new FakeCache();
    const svc = new UnreadService(repo, cache as unknown as UnreadCache, () => NOW);

    const first = await svc.summary(ME);
    data.conversations = []; // đổi sau khi đã cache
    const cached = await svc.summary(ME);
    expect(cached).toEqual(first);
    expect(cached.conversations.unreadConversations).toBe(1);
    expect((await svc.summary(ME, { fresh: true })).conversations.unreadConversations).toBe(0);
  });
});

describe("UnreadService.perWorkspace", () => {
  it("kênh: chỉ đếm tin khi lastSeq > mốc; unread ≤ 100 kèm capped (100+); mentions từ hộp thư", async () => {
    const { repo, data } = makeRepo({
      channels: [
        { channelId: CH1, workspaceId: WS1, lastSeq: 500, notifyMode: "INHERIT" },
        { channelId: CH2, workspaceId: WS1, lastSeq: 5, notifyMode: "INHERIT" },
      ],
      channelReads: { [CH1]: 10, [CH2]: 5 },
      channelUnread: { [CH1]: 400 },
      channelMentions: { [CH1]: 2 },
    });
    const out = await new UnreadService(repo, new FakeCache() as unknown as UnreadCache, () => NOW).perWorkspace(ME, WS1);

    // `lastReadSeq` = mốc đọc của người dùng — app vẽ đường kẻ "Tin chưa đọc" trước tin có seq > mốc này.
    expect(out.channels[CH1]).toEqual({ unread: 100, mentions: 2, lastSeq: 500, capped: true, lastReadSeq: 10 });
    expect(out.channels[CH2]).toEqual({ unread: 0, mentions: 0, lastSeq: 5, capped: false, lastReadSeq: 5 });
    expect(data.channelUnreadCalls).toEqual([CH1]); // CH2 đã đọc hết → không tốn truy vấn đếm
  });

  it("cache theo kênh: lần 2 không đếm lại", async () => {
    const { repo, data } = makeRepo({
      channels: [{ channelId: CH1, workspaceId: WS1, lastSeq: 20, notifyMode: "INHERIT" }],
      channelReads: { [CH1]: 10 },
      channelUnread: { [CH1]: 10 },
    });
    const svc = new UnreadService(repo, new FakeCache() as unknown as UnreadCache, () => NOW);
    await svc.perWorkspace(ME, WS1);
    await svc.perWorkspace(ME, WS1);
    expect(data.channelUnreadCalls).toEqual([CH1]);
  });

  it("thread theo dõi: chỉ liệt kê thread có reply chưa đọc (lastReplySeq > mốc), kèm channelId", async () => {
    const { repo } = makeRepo({
      threads: [
        { threadId: TH1, channelId: CH1, lastReplySeq: 8 },
        { threadId: TH2, channelId: CH1, lastReplySeq: 4 },
      ],
      threadReads: { [TH1]: 5, [TH2]: 4 },
    });
    const out = await new UnreadService(repo, new FakeCache() as unknown as UnreadCache, () => NOW).perWorkspace(ME, WS1);
    expect(out.threads).toEqual({ [TH1]: { unread: 3, channelId: CH1, lastSeq: 8, lastReadSeq: 5 } });
  });

  it("kênh chưa có mốc đọc → lastReadSeq = 0 (đường kẻ đặt trước tin đầu tiên)", async () => {
    const { repo } = makeRepo({
      channels: [{ channelId: CH1, workspaceId: WS1, lastSeq: 4, notifyMode: "INHERIT" }],
      channelUnread: { [CH1]: 4 },
    });
    const out = await new UnreadService(repo, new FakeCache() as unknown as UnreadCache, () => NOW).perWorkspace(ME, WS1);
    expect(out.channels[CH1]).toMatchObject({ unread: 4, lastSeq: 4, lastReadSeq: 0 });
  });
});

describe("isConversationMuted", () => {
  it("MUTED hoặc mutedUntil còn hạn", () => {
    expect(isConversationMuted({ notifyMode: "MUTED", mutedUntil: null }, NOW)).toBe(true);
    expect(isConversationMuted({ notifyMode: "INHERIT", mutedUntil: new Date(NOW.getTime() + 1) }, NOW)).toBe(true);
    expect(isConversationMuted({ notifyMode: "ALL", mutedUntil: new Date(NOW.getTime() - 1) }, NOW)).toBe(false);
    expect(isConversationMuted({ notifyMode: "INHERIT", mutedUntil: null }, NOW)).toBe(false);
  });
});
