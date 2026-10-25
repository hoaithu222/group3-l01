import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import { isMaxTimeExpired, rawObjectIds, toMaxTimeDuration } from "../../../infrastructure/database/mongo-raw";
import type { MongoFilter } from "../../../core/utils/search-query";
import type {
  IMessageSearchRepository,
  RawMessageSearchResult,
  SearchMessageRow,
} from "./search.repository.interface";

const MESSAGE_SELECT = {
  id: true,
  scopeType: true,
  scopeId: true,
  threadId: true,
  seq: true,
  authorId: true,
  content: true,
  createdAt: true,
  deletedAt: true,
  mentions: { select: { type: true, targetId: true, label: true } },
  attachments: { select: { assetId: true, kind: true, name: true, mime: true, size: true } },
} satisfies Prisma.MessageSelect;

type MessageRecord = Prisma.MessageGetPayload<{ select: typeof MESSAGE_SELECT }>;

function mapRow(r: MessageRecord): SearchMessageRow {
  return {
    id: r.id,
    scopeType: r.scopeType,
    scopeId: r.scopeId,
    threadId: r.threadId,
    seq: r.seq,
    authorId: r.authorId,
    content: r.content,
    mentions: r.mentions.map((m) => ({ type: m.type, targetId: m.targetId, label: m.label })),
    attachments: r.attachments.map((a) => ({ assetId: a.assetId, kind: a.kind, name: a.name, mime: a.mime, size: a.size })),
    createdAt: r.createdAt,
    deletedAt: r.deletedAt,
  };
}

export class PrismaMessageSearchRepository implements IMessageSearchRepository {
  async search(filter: MongoFilter, limit: number, maxTimeMs: number): Promise<RawMessageSearchResult> {
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
    return { rows: ids.flatMap((id) => (byId.has(id) ? [mapRow(byId.get(id)!)] : [])), timedOut: false };
  }

  async findHiddenMessageIds(userId: string, messageIds: string[]): Promise<Set<string>> {
    if (messageIds.length === 0) return new Set();
    const rows = await prisma.messageHide.findMany({ where: { userId, messageId: { in: messageIds } }, select: { messageId: true } });
    return new Set(rows.map((r) => r.messageId));
  }

  async findExistingMessageIds(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await prisma.message.findMany({ where: { id: { in: ids } }, select: { id: true } });
    return new Set(rows.map((r) => r.id));
  }
}
