/**
 * Test double dùng chung cho unit test `SavedService`/`ScopeSearchService` — repository
 * in-memory + `MessageScope` giả (đăng ký quyền theo bảng), không cần Prisma/Mongo/Redis.
 */
import type { MessageScope } from "../../../messages/public";
import type { AuthUser } from "../../../../core/types/express";
import type {
  ChannelInfo,
  ConversationInfo,
  DiscoveryMessage,
  DiscoveryScopeType,
  DiscoveryUserBrief,
  SearchRow,
} from "../../entities/discovery.interface";
import type { IDiscoveryLookupRepository } from "../../repositories/discovery-lookup.repository.interface";
import type {
  IMessageSearchRepository,
  SearchQueryResult,
} from "../../repositories/message-search.repository.interface";
import type { MongoFilter } from "../../services/search-query.builder";

export const USER_A: AuthUser = { id: "aaaaaaaaaaaaaaaaaaaaaaa1", email: "a@e.com", role: "user" };
export const USER_B: AuthUser = { id: "aaaaaaaaaaaaaaaaaaaaaaa2", email: "b@e.com", role: "user" };
export const CHANNEL_ID = "cccccccccccccccccccccc01";
export const CHANNEL_ID_2 = "cccccccccccccccccccccc02";
export const CONV_ID = "dddddddddddddddddddddd01";

let idCounter = 0;
export const nextId = (): string => (++idCounter).toString(16).padStart(24, "0");

export function makeMessage(overrides: Partial<DiscoveryMessage> = {}): DiscoveryMessage {
  return {
    id: nextId(),
    scopeType: "CHANNEL",
    scopeId: CHANNEL_ID,
    workspaceId: "wwwwwwwwwwwwwwwwwwwwwww1",
    threadId: null,
    threadKey: "root",
    seq: 1,
    authorId: USER_B.id,
    kind: "USER",
    content: "Đồ án cuối kỳ",
    mentions: [],
    attachments: [],
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

export interface FakeScopeState {
  /** userId → có đọc được không. */
  readable: Set<string>;
  hiddenBeforeSeq: Map<string, number>;
  /** Đếm số lần `canRead` — kiểm "1 lần/phạm vi" và "kiểm lại trước khi trả". */
  canReadCalls: number;
  /** Chạy ngay SAU lần `canRead` thứ N (vd thu hồi quyền giữa 2 lần kiểm). */
  onCanRead?: (call: number) => void;
  searchable: boolean;
}

export function makeFakeScope(scopeType: DiscoveryScopeType, state: FakeScopeState): MessageScope {
  return {
    scopeType,
    async canRead(user: AuthUser) {
      state.canReadCalls += 1;
      const visible = state.readable.has(user.id);
      state.onCanRead?.(state.canReadCalls);
      return { visible, workspaceId: scopeType === "CHANNEL" ? "wwwwwwwwwwwwwwwwwwwwwww1" : null };
    },
    async canWrite() {
      return { visible: true, allowed: true, workspaceId: null };
    },
    async viewerContext(user: AuthUser) {
      return {
        hiddenBeforeSeq: state.hiddenBeforeSeq.get(user.id) ?? 0,
        capabilities: { canWrite: true, canReact: true, canPin: true, canModerate: false },
      };
    },
    pinMax: () => 20,
    readerIds: async () => [],
    onMessageCommitted: async () => undefined,
    emitActivity: async () => undefined,
    contentRoom: (id: string) => `${scopeType}:${id}`,
    searchable: () => state.searchable,
  } as MessageScope;
}

export function newScopeState(readableUsers: string[] = [USER_A.id]): FakeScopeState {
  return { readable: new Set(readableUsers), hiddenBeforeSeq: new Map(), canReadCalls: 0, searchable: true };
}

/** Repository tin nhắn giả: `search` trả kết quả do test cấu hình theo từng lần gọi. */
export class FakeMessageSearchRepo implements IMessageSearchRepository {
  messages = new Map<string, DiscoveryMessage>();
  hidden = new Map<string, Set<string>>(); // userId → messageIds
  /** Mỗi phần tử = kết quả 1 lần gọi `search()` (hết thì trả rỗng). */
  searchScript: SearchQueryResult[] = [];
  searchCalls: { filter: MongoFilter; limit: number; maxTimeMs: number }[] = [];

  add(...msgs: DiscoveryMessage[]): void {
    for (const m of msgs) this.messages.set(m.id, m);
  }

  async search(filter: MongoFilter, limit: number, maxTimeMs: number): Promise<SearchQueryResult> {
    this.searchCalls.push({ filter, limit, maxTimeMs });
    return this.searchScript.shift() ?? { rows: [], timedOut: false };
  }

  async findMessagesByIds(ids: string[]): Promise<DiscoveryMessage[]> {
    return ids.flatMap((id) => {
      const m = this.messages.get(id);
      return m ? [m] : [];
    });
  }

  async findHiddenMessageIds(userId: string, messageIds: string[]): Promise<Set<string>> {
    const mine = this.hidden.get(userId) ?? new Set<string>();
    return new Set(messageIds.filter((id) => mine.has(id)));
  }

  async findExistingMessageIds(scopeType: DiscoveryScopeType, scopeId: string, ids: string[]): Promise<Set<string>> {
    return new Set(
      ids.filter((id) => {
        const m = this.messages.get(id);
        return m && m.scopeType === scopeType && m.scopeId === scopeId;
      })
    );
  }
}

export class FakeLookupRepo implements IDiscoveryLookupRepository {
  channels = new Map<string, ChannelInfo>([
    [CHANNEL_ID, { name: "chung", isPrivate: false }],
    [CHANNEL_ID_2, { name: "bi-mat", isPrivate: true }],
  ]);
  conversations = new Map<string, ConversationInfo>([[CONV_ID, { kind: "GROUP", title: "Nhóm đồ án", peerName: null }]]);
  names = new Map<string, string>([
    [USER_A.id, "An"],
    [USER_B.id, "Bình"],
  ]);
  /** userId → `avatarAssetId` (mặc định chưa ai có ảnh). */
  avatars = new Map<string, string>();
  calls = { channels: 0, conversations: 0 };

  async describeChannels(ids: string[]): Promise<Map<string, ChannelInfo>> {
    this.calls.channels += 1;
    return new Map(ids.flatMap((id) => (this.channels.has(id) ? [[id, this.channels.get(id) as ChannelInfo] as const] : [])));
  }

  async describeConversations(_viewerId: string, ids: string[]): Promise<Map<string, ConversationInfo>> {
    this.calls.conversations += 1;
    return new Map(
      ids.flatMap((id) => (this.conversations.has(id) ? [[id, this.conversations.get(id) as ConversationInfo] as const] : []))
    );
  }

  async userBriefs(ids: string[]): Promise<Map<string, DiscoveryUserBrief>> {
    return new Map(
      ids.flatMap((id) => {
        const name = this.names.get(id);
        return name === undefined ? [] : [[id, { name, avatarAssetId: this.avatars.get(id) ?? null }] as const];
      })
    );
  }
}

export function toRow(m: DiscoveryMessage): SearchRow {
  return {
    id: m.id,
    seq: m.seq,
    threadId: m.threadId,
    authorId: m.authorId,
    createdAt: m.createdAt,
    content: m.content,
    mentions: m.mentions,
    attachmentKinds: m.attachments.map((a) => a.kind),
    deletedAt: m.deletedAt,
  };
}
