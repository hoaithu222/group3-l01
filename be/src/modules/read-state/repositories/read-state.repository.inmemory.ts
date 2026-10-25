import type { AdvanceReadStateInput, ConversationAdvance, ThreadInfo } from "../entities/read-state.interface";
import type { IReadStateRepository } from "./read-state.repository.interface";

interface MemberRow {
  lastReadSeq: number;
  unreadCount: number;
  mentionCount: number;
  markedUnread: boolean;
  active: boolean;
  activityAt: Date;
}

/** Triển khai bộ nhớ cho test đơn vị (kẹp/`$max`/NT-03) — hành vi "chỉ tăng" giống bản Prisma. */
export class InMemoryReadStateRepository implements IReadStateRepository {
  readonly conversations = new Map<string, number>();
  readonly channels = new Map<string, { workspaceId: string; lastSeq: number }>();
  /** Khoá theo `Thread.id`. */
  readonly threads = new Map<string, ThreadInfo>();
  readonly readStates = new Map<string, number>();
  readonly members = new Map<string, MemberRow>();
  /** Số tin chưa đọc (của người khác) sau mốc `seq` — test dựng sẵn thay vì có bảng Message. */
  unreadAfter: (conversationId: string, seq: number) => number = () => 0;

  async findConversationLastSeq(id: string): Promise<number | null> {
    return this.conversations.get(id) ?? null;
  }

  async findChannelInfo(id: string) {
    return this.channels.get(id) ?? null;
  }

  async findThreadInfo(idOrRoot: string) {
    return this.threads.get(idOrRoot) ?? [...this.threads.values()].find((t) => t.parentMessageId === idOrRoot) ?? null;
  }

  async advanceReadState(input: AdvanceReadStateInput): Promise<{ changed: boolean; lastReadSeq: number }> {
    const key = `${input.userId}:${input.streamType}:${input.streamId}`;
    const current = this.readStates.get(key) ?? 0;
    if (input.seq <= current) return { changed: false, lastReadSeq: current };
    this.readStates.set(key, input.seq);
    return { changed: true, lastReadSeq: input.seq };
  }

  async advanceConversationMember(input: {
    conversationId: string;
    userId: string;
    seq: number;
    now: Date;
  }): Promise<ConversationAdvance | null> {
    const key = `${input.conversationId}:${input.userId}`;
    const m = this.members.get(key);
    if (!m || !m.active) return null;
    if (m.lastReadSeq >= input.seq) {
      const changed = m.markedUnread;
      m.markedUnread = false;
      return { changed, lastReadSeq: m.lastReadSeq, unreadCount: m.unreadCount, mentionCount: m.mentionCount };
    }
    m.lastReadSeq = input.seq;
    m.unreadCount = this.unreadAfter(input.conversationId, input.seq);
    m.mentionCount = 0;
    m.markedUnread = false;
    return { changed: true, lastReadSeq: m.lastReadSeq, unreadCount: m.unreadCount, mentionCount: 0 };
  }

  async listUnreadConversationTargets(userId: string, before: Date) {
    const out: { conversationId: string; lastSeq: number }[] = [];
    for (const [key, m] of this.members) {
      const [conversationId, uid] = key.split(":");
      if (uid !== userId || !m.active || m.activityAt > before) continue;
      if (m.unreadCount > 0 || m.markedUnread) {
        out.push({ conversationId, lastSeq: this.conversations.get(conversationId) ?? 0 });
      }
    }
    return out;
  }

  async getThreadReadSeqs(userId: string, threadIds: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    for (const id of threadIds) {
      const v = this.readStates.get(`${userId}:THREAD:${id}`);
      if (v !== undefined) out.set(id, v);
    }
    return out;
  }
}
