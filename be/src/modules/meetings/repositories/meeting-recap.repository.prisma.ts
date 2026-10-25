import { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { NewRecap, RecapEntity, RecapPatch } from "../entities/meeting-recap.interface";
import { RecapConflictError, type IMeetingRecapRepository } from "./meeting-recap.repository.interface";
import type { TxHandle } from "./tx";

type Row = Awaited<ReturnType<typeof prisma.meetingRecap.findFirstOrThrow>>;

const toEntity = (r: Row): RecapEntity => ({
  id: r.id,
  meetingId: r.meetingId,
  workspaceId: r.workspaceId,
  content: r.content,
  publishedContent: r.publishedContent,
  publishedAssetIds: r.publishedAssetIds,
  startedAt: r.startedAt,
  endedAt: r.endedAt,
  authorId: r.authorId,
  lastEditedBy: r.lastEditedBy,
  publishedAt: r.publishedAt,
  publishedBy: r.publishedBy,
  publishedVersion: r.publishedVersion,
  systemMessageId: r.systemMessageId,
  attachmentCount: r.attachmentCount,
  version: r.version,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

const client = (tx?: TxHandle) => tx ?? prisma;

export class PrismaMeetingRecapRepository implements IMeetingRecapRepository {
  async findByMeetingId(meetingId: string, tx?: TxHandle): Promise<RecapEntity | null> {
    const r = await client(tx).meetingRecap.findUnique({ where: { meetingId } });
    return r ? toEntity(r) : null;
  }

  async findById(id: string): Promise<RecapEntity | null> {
    const r = await prisma.meetingRecap.findUnique({ where: { id } });
    return r ? toEntity(r) : null;
  }

  async create(tx: TxHandle, m: NewRecap): Promise<RecapEntity> {
    try {
      const r = await tx.meetingRecap.create({
        data: {
          meetingId: m.meetingId,
          workspaceId: m.workspaceId,
          content: m.content,
          startedAt: m.startedAt,
          endedAt: m.endedAt,
          authorId: m.authorId,
          lastEditedBy: m.lastEditedBy,
          publishedContent: null,
          publishedAt: null,
          publishedBy: null,
          publishedVersion: null,
          systemMessageId: null,
        },
      });
      return toEntity(r);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new RecapConflictError();
      throw err;
    }
  }

  async update(tx: TxHandle | undefined, meetingId: string, expectedVersion: number, patch: RecapPatch): Promise<RecapEntity | null> {
    const c = client(tx);
    const res = await c.meetingRecap.updateMany({ where: { meetingId, version: expectedVersion }, data: { ...patch, version: { increment: 1 } } });
    if (res.count === 0) return null;
    const r = await c.meetingRecap.findUnique({ where: { meetingId } });
    return r ? toEntity(r) : null;
  }

  async adjustAttachments(tx: TxHandle, recapId: string, delta: number, max?: number): Promise<boolean> {
    const where: Prisma.MeetingRecapWhereInput =
      delta > 0 && max !== undefined ? { id: recapId, attachmentCount: { lt: max } } : delta < 0 ? { id: recapId, attachmentCount: { gt: 0 } } : { id: recapId };
    const res = await tx.meetingRecap.updateMany({ where, data: { attachmentCount: { increment: delta }, version: { increment: 1 } } });
    return res.count > 0;
  }

  async setSystemMessageId(recapId: string, messageId: string): Promise<void> {
    // Không tăng `version`: đây là con trỏ nội bộ tới tin chat, không phải thay đổi nội dung người dùng nhìn thấy.
    await prisma.meetingRecap.updateMany({ where: { id: recapId }, data: { systemMessageId: messageId } });
  }

  async publishedMeetingIds(meetingIds: string[]): Promise<Set<string>> {
    if (meetingIds.length === 0) return new Set();
    const rows = await prisma.meetingRecap.findMany({ where: { meetingId: { in: meetingIds }, publishedAt: { not: null } }, select: { meetingId: true } });
    return new Set(rows.map((r) => r.meetingId));
  }
}
