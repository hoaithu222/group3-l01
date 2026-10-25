import type { MentorPost as PrismaMentorPost, Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import { decodeCursor, encodeCursor } from "../../../core/utils/cursor";
import { escapeRegex } from "../../../core/utils/escape-regex";
import type {
  CursorPage,
  MentorPost,
  MentorPostCreateInput,
  MentorPostFeedFilter,
  MentorPostPatch,
  MentorPostStatus,
} from "../entities/mentor.interface";
import type { HiddenState, IMentorPostRepository } from "./mentor-post.repository.interface";
import type { TxHandle } from "./tx";

const toEntity = (r: PrismaMentorPost): MentorPost => ({
  id: r.id,
  workspaceId: r.workspaceId,
  createdBy: r.createdBy,
  title: r.title,
  normalizedTitle: r.normalizedTitle,
  description: r.description,
  skills: r.skills,
  skillLabels: r.skillLabels,
  commitmentHoursPerWeek: r.commitmentHoursPerWeek,
  mentorsNeeded: r.mentorsNeeded,
  activeEngagements: r.activeEngagements,
  status: r.status,
  applicantsCount: r.applicantsCount,
  expiresAt: r.expiresAt,
  reportedCount: r.reportedCount,
  hiddenAt: r.hiddenAt ?? null,
  hiddenBy: r.hiddenBy ?? null,
  hiddenReason: r.hiddenReason ?? null,
  version: r.version,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
  closedAt: r.closedAt ?? null,
});

/** `{ f: null }` KHÔNG khớp doc vắng field (bẫy Prisma-Mongo) — lọc chưa ẩn bằng cả hai nhánh. */
const NOT_HIDDEN: Prisma.MentorPostWhereInput = { OR: [{ hiddenAt: null }, { hiddenAt: { isSet: false } }] };

export class PrismaMentorPostRepository implements IMentorPostRepository {
  async findById(id: string, tx?: TxHandle): Promise<MentorPost | null> {
    const row = await (tx ?? prisma).mentorPost.findUnique({ where: { id } });
    return row ? toEntity(row) : null;
  }

  async findByIds(ids: string[]): Promise<MentorPost[]> {
    if (ids.length === 0) return [];
    return (await prisma.mentorPost.findMany({ where: { id: { in: ids } } })).map(toEntity);
  }

  async create(input: MentorPostCreateInput): Promise<MentorPost> {
    const row = await prisma.mentorPost.create({
      data: { ...input, status: "OPEN", hiddenAt: null, hiddenBy: null, hiddenReason: null, closedAt: null },
    });
    return toEntity(row);
  }

  async listFeed(filter: MentorPostFeedFilter, cursor: string | undefined, limit: number): Promise<CursorPage<MentorPost>> {
    const and: Prisma.MentorPostWhereInput[] = [NOT_HIDDEN, { status: filter.status }];
    if (filter.status === "OPEN") and.push({ expiresAt: { gt: filter.now } });
    if (filter.workspaceId) and.push({ workspaceId: filter.workspaceId });
    if (filter.skills && filter.skills.length > 0) and.push({ skills: { hasEvery: filter.skills } });
    // `contains` của Prisma-Mongo dựng `$regex` KHÔNG escape → bọc `escapeRegex` (chống ReDoS, reuse-first.md).
    if (filter.q) and.push({ normalizedTitle: { contains: escapeRegex(filter.q) } });
    const at = cursor ? decodeCursor(cursor) : null;
    if (at) and.push({ OR: [{ createdAt: { lt: at.at } }, { createdAt: at.at, id: { lt: at.id } }] });

    const rows = await prisma.mentorPost.findMany({ where: { AND: and }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1 });
    const page = rows.slice(0, limit).map(toEntity);
    const last = page[page.length - 1];
    return { data: page, nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null };
  }

  async listByWorkspace(workspaceId: string, limit: number): Promise<MentorPost[]> {
    const rows = await prisma.mentorPost.findMany({ where: { workspaceId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit });
    return rows.map(toEntity);
  }

  countOpenByWorkspace(workspaceId: string, now: Date): Promise<number> {
    return prisma.mentorPost.count({ where: { workspaceId, status: "OPEN", expiresAt: { gt: now } } });
  }

  async updateWithVersion(id: string, expectedVersion: number, patch: MentorPostPatch): Promise<boolean> {
    const res = await prisma.mentorPost.updateMany({
      where: { id, version: expectedVersion, status: { not: "CLOSED" } },
      data: { ...patch, version: { increment: 1 } },
    });
    return res.count === 1;
  }

  async claimSlot(tx: TxHandle, id: string, expectedVersion: number, nextStatus: MentorPostStatus): Promise<boolean> {
    const res = await tx.mentorPost.updateMany({
      where: { id, version: expectedVersion, status: "OPEN" },
      data: { activeEngagements: { increment: 1 }, version: { increment: 1 }, status: nextStatus },
    });
    return res.count === 1;
  }

  async releaseSlot(tx: TxHandle, id: string, now: Date): Promise<void> {
    const post = await tx.mentorPost.findUnique({ where: { id } });
    if (!post) return;
    const active = Math.max(0, post.activeEngagements - 1);
    const reopen = post.status === "FULFILLED" && post.expiresAt > now && active < post.mentorsNeeded;
    await tx.mentorPost.update({
      where: { id },
      data: { activeEngagements: active, version: { increment: 1 }, ...(reopen && { status: "OPEN" }) },
    });
  }

  async incrementApplicants(tx: TxHandle, id: string): Promise<void> {
    await tx.mentorPost.update({ where: { id }, data: { applicantsCount: { increment: 1 } } });
  }

  async close(tx: TxHandle, id: string, now: Date): Promise<boolean> {
    const res = await tx.mentorPost.updateMany({
      where: { id, status: { in: ["OPEN", "FULFILLED"] } },
      data: { status: "CLOSED", closedAt: now, version: { increment: 1 } },
    });
    return res.count === 1;
  }

  async listExpired(now: Date, limit: number): Promise<MentorPost[]> {
    const rows = await prisma.mentorPost.findMany({
      where: { status: { in: ["OPEN", "FULFILLED"] }, expiresAt: { lte: now } },
      orderBy: { expiresAt: "asc" },
      take: limit,
    });
    return rows.map(toEntity);
  }

  async setHidden(id: string, hidden: HiddenState | null): Promise<boolean> {
    const res = await prisma.mentorPost.updateMany({
      where: { id },
      data: hidden
        ? { hiddenAt: hidden.at, hiddenBy: hidden.by, hiddenReason: hidden.reason, version: { increment: 1 } }
        : { hiddenAt: null, hiddenBy: null, hiddenReason: null, version: { increment: 1 } },
    });
    return res.count === 1;
  }

  async setReportedCount(id: string, count: number): Promise<void> {
    await prisma.mentorPost.updateMany({ where: { id }, data: { reportedCount: count } });
  }
}
