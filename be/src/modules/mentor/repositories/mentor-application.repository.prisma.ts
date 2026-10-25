import { Prisma, type MentorApplication as PrismaMentorApplication } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import { decodeCursor, encodeCursor } from "../../../core/utils/cursor";
import type {
  CursorPage,
  MentorApplication,
  MentorApplicationCreateInput,
  MentorApplicationStatus,
} from "../entities/mentor.interface";
import {
  DuplicateApplicationError,
  type ApplicationTransition,
  type IMentorApplicationRepository,
} from "./mentor-application.repository.interface";
import type { TxHandle } from "./tx";

const toEntity = (r: PrismaMentorApplication): MentorApplication => ({
  id: r.id,
  postId: r.postId,
  workspaceId: r.workspaceId,
  applicantId: r.applicantId,
  message: r.message,
  portfolioUrl: r.portfolioUrl ?? null,
  status: r.status,
  reviewedBy: r.reviewedBy ?? null,
  reviewedAt: r.reviewedAt ?? null,
  rejectReason: r.rejectReason ?? null,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

function cursorWhere(cursor: string | undefined): Prisma.MentorApplicationWhereInput | null {
  const at = cursor ? decodeCursor(cursor) : null;
  return at ? { OR: [{ createdAt: { lt: at.at } }, { createdAt: at.at, id: { lt: at.id } }] } : null;
}

async function page(where: Prisma.MentorApplicationWhereInput, limit: number): Promise<CursorPage<MentorApplication>> {
  const rows = await prisma.mentorApplication.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1 });
  const data = rows.slice(0, limit).map(toEntity);
  const last = data[data.length - 1];
  return { data, nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null };
}

export class PrismaMentorApplicationRepository implements IMentorApplicationRepository {
  async findById(id: string): Promise<MentorApplication | null> {
    const row = await prisma.mentorApplication.findUnique({ where: { id } });
    return row ? toEntity(row) : null;
  }

  async findByPostAndApplicant(postId: string, applicantId: string): Promise<MentorApplication | null> {
    const row = await prisma.mentorApplication.findFirst({ where: { postId, applicantId } });
    return row ? toEntity(row) : null;
  }

  async create(tx: TxHandle, input: MentorApplicationCreateInput): Promise<MentorApplication> {
    try {
      const row = await tx.mentorApplication.create({
        data: { ...input, status: "PENDING", reviewedBy: null, reviewedAt: null, rejectReason: null },
      });
      return toEntity(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new DuplicateApplicationError();
      throw err;
    }
  }

  countPendingByApplicant(applicantId: string): Promise<number> {
    return prisma.mentorApplication.count({ where: { applicantId, status: "PENDING" } });
  }

  async countPendingByPosts(postIds: string[]): Promise<Record<string, number>> {
    if (postIds.length === 0) return {};
    const rows = await prisma.mentorApplication.groupBy({ by: ["postId"], where: { postId: { in: postIds }, status: "PENDING" }, _count: { _all: true } });
    return Object.fromEntries(rows.map((r) => [r.postId, r._count._all]));
  }

  listByPost(postId: string, status: MentorApplicationStatus | undefined, cursor: string | undefined, limit: number) {
    const and: Prisma.MentorApplicationWhereInput[] = [{ postId }];
    if (status) and.push({ status });
    const c = cursorWhere(cursor);
    if (c) and.push(c);
    return page({ AND: and }, limit);
  }

  listByApplicant(applicantId: string, cursor: string | undefined, limit: number) {
    const c = cursorWhere(cursor);
    return page(c ? { AND: [{ applicantId }, c] } : { applicantId }, limit);
  }

  async findMineForPosts(applicantId: string, postIds: string[]): Promise<MentorApplication[]> {
    if (postIds.length === 0) return [];
    return (await prisma.mentorApplication.findMany({ where: { applicantId, postId: { in: postIds } } })).map(toEntity);
  }

  async transition(tx: TxHandle, id: string, from: MentorApplicationStatus[], to: ApplicationTransition): Promise<boolean> {
    const res = await tx.mentorApplication.updateMany({ where: { id, status: { in: from } }, data: to });
    return res.count === 1;
  }

  async expirePendingByPost(tx: TxHandle, postId: string, now: Date): Promise<number> {
    const res = await tx.mentorApplication.updateMany({ where: { postId, status: "PENDING" }, data: { status: "EXPIRED", reviewedAt: now } });
    return res.count;
  }
}
