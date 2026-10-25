import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import { isMaxTimeExpired, rawObjectIds, toMaxTimeDuration } from "../../../infrastructure/database/mongo-raw";
import type { DiscoveryMessage, DiscoveryScopeType, SearchRow } from "../entities/discovery.interface";
import type { MongoFilter } from "../services/search-query.builder";
import type { IMessageSearchRepository, SearchQueryResult } from "./message-search.repository.interface";

const MESSAGE_SELECT = {
  id: true,
  scopeType: true,
  scopeId: true,
  workspaceId: true,
  threadId: true,
  threadKey: true,
  seq: true,
  authorId: true,
  kind: true,
  content: true,
  createdAt: true,
  deletedAt: true,
  mentions: { select: { type: true, targetId: true, label: true } },
  attachments: { select: { kind: true, name: true } },
} satisfies Prisma.MessageSelect;

type MessageRow = Prisma.MessageGetPayload<{ select: typeof MESSAGE_SELECT }>;

function mapMessage(r: MessageRow): DiscoveryMessage {
  return {
    id: r.id,
    scopeType: r.scopeType as DiscoveryScopeType,
    scopeId: r.scopeId,
    workspaceId: r.workspaceId,
    threadId: r.threadId,
    threadKey: r.threadKey,
    seq: r.seq,
    authorId: r.authorId,
    kind: r.kind,
    content: r.content,
    mentions: r.mentions.map((m) => ({ type: m.type, targetId: m.targetId, label: m.label })),
    attachments: r.attachments.map((a) => ({ kind: a.kind, name: a.name })),
    createdAt: r.createdAt,
    deletedAt: r.deletedAt,
  };
}

function mapSearchRow(m: DiscoveryMessage): SearchRow {
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

export class PrismaMessageSearchRepository implements IMessageSearchRepository {
  async search(filter: MongoFilter, limit: number, maxTimeMs: number): Promise<SearchQueryResult> {
    let raw: unknown;
    try {
      raw = await prisma.message.findRaw({
        filter: filter as Prisma.InputJsonObject,
        options: { sort: { createdAt: -1, _id: -1 }, limit, maxTimeMS: toMaxTimeDuration(maxTimeMs), projection: { _id: 1 } },
      });
    } catch (err) {
      if (isMaxTimeExpired(err)) return { rows: [], timedOut: true };
      throw err;
    }

    const ids = rawObjectIds(raw);
    if (ids.length === 0) return { rows: [], timedOut: false };

    const docs = await prisma.message.findMany({ where: { id: { in: ids } }, select: MESSAGE_SELECT });
    const byId = new Map(docs.map((d) => [d.id, d]));
    const rows = ids.flatMap((id) => {
      const d = byId.get(id);
      return d ? [mapSearchRow(mapMessage(d))] : [];
    });
    return { rows, timedOut: false };
  }

  async findMessagesByIds(ids: string[]): Promise<DiscoveryMessage[]> {
    if (ids.length === 0) return [];
    const docs = await prisma.message.findMany({ where: { id: { in: ids } }, select: MESSAGE_SELECT });
    return docs.map(mapMessage);
  }

  async findHiddenMessageIds(userId: string, messageIds: string[]): Promise<Set<string>> {
    if (messageIds.length === 0) return new Set();
    const rows = await prisma.messageHide.findMany({
      where: { userId, messageId: { in: messageIds } },
      select: { messageId: true },
    });
    return new Set(rows.map((r) => r.messageId));
  }

  async findExistingMessageIds(scopeType: DiscoveryScopeType, scopeId: string, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await prisma.message.findMany({
      where: { id: { in: ids }, scopeType, scopeId },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }
}
