import type { JobOffer as PrismaOffer, Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import { offerClosedKey } from "../domain/company-keys";
import { ejsonId } from "../domain/talent-query";
import { OFFER_STATUSES, OPEN_OFFER_STATUSES, type JobOffer, type JobOfferStatus, type OfferMessageSide } from "../entities/recruiter.interface";
import type { IJobOfferRepository, JobOfferCreateInput, JobOfferPatch, MonthlyOfferStats, OfferListFilter } from "./job-offer.repository.interface";
import { mapUnique, type TxHandle } from "./tx";

export const toOffer = (r: PrismaOffer): JobOffer => ({
  id: r.id,
  companyId: r.companyId,
  recruiterId: r.recruiterId,
  studentId: r.studentId,
  title: r.title,
  message: r.message,
  employmentType: r.employmentType,
  location: r.location ?? null,
  jdAssetId: r.jdAssetId ?? null,
  status: r.status,
  activeKey: r.activeKey,
  clientRequestId: r.clientRequestId,
  sharedEmail: r.sharedEmail ?? null,
  declineReason: r.declineReason ?? null,
  threadLocked: r.threadLocked,
  studentUnread: r.studentUnread,
  companyUnread: r.companyUnread,
  reportedCount: r.reportedCount,
  sentAt: r.sentAt,
  readAt: r.readAt ?? null,
  respondedAt: r.respondedAt ?? null,
  withdrawnAt: r.withdrawnAt ?? null,
  expiresAt: r.expiresAt,
  lastMessageAt: r.lastMessageAt ?? null,
  version: r.version,
});

const db = (tx?: TxHandle) => tx ?? prisma;
const OPEN = [...OPEN_OFFER_STATUSES];

function listWhere(base: Prisma.JobOfferWhereInput, f: OfferListFilter): Prisma.JobOfferWhereInput {
  return {
    ...base,
    ...(f.status ? { status: f.status } : {}),
    ...(f.recruiterId ? { recruiterId: f.recruiterId } : {}),
    ...(f.before ? { OR: [{ sentAt: { lt: f.before.at } }, { sentAt: f.before.at, id: { lt: f.before.id } }] } : {}),
  };
}

const num = (v: unknown): number => (typeof v === "number" ? v : 0);

export class PrismaJobOfferRepository implements IJobOfferRepository {
  async findById(id: string, tx?: TxHandle): Promise<JobOffer | null> {
    const r = await db(tx).jobOffer.findUnique({ where: { id } });
    return r ? toOffer(r) : null;
  }

  async findByRequest(recruiterId: string, clientRequestId: string, tx?: TxHandle): Promise<JobOffer | null> {
    const r = await db(tx).jobOffer.findUnique({ where: { recruiterId_clientRequestId: { recruiterId, clientRequestId } } });
    return r ? toOffer(r) : null;
  }

  create(input: JobOfferCreateInput, tx?: TxHandle): Promise<JobOffer> {
    return mapUnique("activeKey", async () =>
      toOffer(
        await db(tx).jobOffer.create({
          data: {
            ...input,
            status: "SENT",
            sharedEmail: null,
            declineReason: null,
            threadLocked: false,
            studentUnread: 0,
            companyUnread: 0,
            reportedCount: 0,
            readAt: null,
            respondedAt: null,
            withdrawnAt: null,
            lastMessageAt: null,
            version: 1,
          },
        })
      )
    );
  }

  async transition(id: string, from: readonly JobOfferStatus[], patch: JobOfferPatch, tx?: TxHandle): Promise<JobOffer | null> {
    const res = await db(tx).jobOffer.updateMany({ where: { id, status: { in: [...from] } }, data: { ...patch, version: { increment: 1 } } });
    if (res.count === 0) return null;
    const r = await db(tx).jobOffer.findUnique({ where: { id } });
    return r ? toOffer(r) : null;
  }

  async listForStudent(studentId: string, f: OfferListFilter): Promise<JobOffer[]> {
    const rows = await prisma.jobOffer.findMany({ where: listWhere({ studentId }, f), orderBy: [{ sentAt: "desc" }, { id: "desc" }], take: f.take });
    return rows.map(toOffer);
  }

  async listForCompany(companyId: string, f: OfferListFilter): Promise<JobOffer[]> {
    const rows = await prisma.jobOffer.findMany({ where: listWhere({ companyId }, f), orderBy: [{ sentAt: "desc" }, { id: "desc" }], take: f.take });
    return rows.map(toOffer);
  }

  async openByCompany(companyId: string, limit: number): Promise<JobOffer[]> {
    const rows = await prisma.jobOffer.findMany({ where: { companyId, status: { in: OPEN } }, orderBy: { sentAt: "desc" }, take: limit });
    return rows.map(toOffer);
  }

  async openByStudent(studentId: string, limit = 500): Promise<JobOffer[]> {
    const rows = await prisma.jobOffer.findMany({ where: { studentId, status: { in: OPEN } }, orderBy: { sentAt: "desc" }, take: limit });
    return rows.map(toOffer);
  }

  async openByStudentCompany(studentId: string, companyId: string): Promise<JobOffer[]> {
    const rows = await prisma.jobOffer.findMany({ where: { studentId, companyId, status: { in: OPEN } } });
    return rows.map(toOffer);
  }

  async hasOfferBetween(studentId: string, companyId: string): Promise<boolean> {
    return (await prisma.jobOffer.count({ where: { studentId, companyId } })) > 0;
  }

  async findDue(now: Date, limit: number): Promise<JobOffer[]> {
    const rows = await prisma.jobOffer.findMany({ where: { status: { in: ["SENT", "READ"] }, expiresAt: { lte: now } }, orderBy: { expiresAt: "asc" }, take: limit });
    return rows.map(toOffer);
  }

  async lockThread(id: string, tx?: TxHandle): Promise<JobOffer | null> {
    const res = await db(tx).jobOffer.updateMany({ where: { id, status: { in: OPEN }, threadLocked: false }, data: { threadLocked: true, version: { increment: 1 } } });
    if (res.count === 0) return null;
    const r = await db(tx).jobOffer.findUnique({ where: { id } });
    return r ? toOffer(r) : null;
  }

  async detachStudent(id: string, tx?: TxHandle): Promise<boolean> {
    const res = await db(tx).jobOffer.updateMany({ where: { id, status: { in: OPEN } }, data: { threadLocked: true, activeKey: offerClosedKey(id), version: { increment: 1 } } });
    return res.count > 0;
  }

  async addUnread(id: string, side: OfferMessageSide, lastMessageAt: Date, tx?: TxHandle): Promise<void> {
    // Tin của CÔNG TY làm tăng chưa-đọc của SINH VIÊN và ngược lại.
    await db(tx).jobOffer.updateMany({ where: { id }, data: { lastMessageAt, ...(side === "COMPANY" ? { studentUnread: { increment: 1 } } : { companyUnread: { increment: 1 } }) } });
  }

  async clearUnread(id: string, side: OfferMessageSide): Promise<void> {
    // `side` = phía người ĐỌC.
    await prisma.jobOffer.updateMany({ where: { id, ...(side === "CANDIDATE" ? { studentUnread: { gt: 0 } } : { companyUnread: { gt: 0 } }) }, data: side === "CANDIDATE" ? { studentUnread: 0 } : { companyUnread: 0 } });
  }

  async countByStatus(companyId: string): Promise<Record<JobOfferStatus, number>> {
    const counts = await Promise.all(OFFER_STATUSES.map((s) => prisma.jobOffer.count({ where: { companyId, status: s } })));
    return Object.fromEntries(OFFER_STATUSES.map((s, i) => [s, counts[i]])) as Record<JobOfferStatus, number>;
  }

  async setReportedCount(id: string, count: number): Promise<void> {
    await prisma.jobOffer.updateMany({ where: { id }, data: { reportedCount: count } });
  }

  async statsByMonth(from: Date, to: Date, tz: string): Promise<MonthlyOfferStats[]> {
    const flag = (cond: Prisma.InputJsonValue): Prisma.InputJsonObject => ({ $sum: { $cond: [cond, 1, 0] } });
    const raw = (await prisma.jobOffer.aggregateRaw({
      pipeline: [
        { $match: { sentAt: { $gte: { $date: from.toISOString() }, $lte: { $date: to.toISOString() } } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m", date: "$sentAt", timezone: tz } },
            sent: { $sum: 1 },
            read: flag({ $gt: ["$readAt", null] }),
            interested: flag({ $and: [{ $gt: ["$respondedAt", null] }, { $eq: [{ $ifNull: ["$declineReason", null] }, null] }] }),
            declined: flag({ $gt: ["$declineReason", null] }),
            expired: flag({ $eq: ["$status", "EXPIRED"] }),
          },
        },
        { $sort: { _id: 1 } },
      ],
    })) as unknown as Array<Record<string, unknown>>;
    return raw.map((r) => ({ period: String(r._id), sent: num(r.sent), read: num(r.read), interested: num(r.interested), declined: num(r.declined), expired: num(r.expired) }));
  }

  async topCompanies(from: Date, to: Date, limit: number): Promise<Array<{ companyId: string; sent: number }>> {
    const raw = (await prisma.jobOffer.aggregateRaw({
      pipeline: [
        { $match: { sentAt: { $gte: { $date: from.toISOString() }, $lte: { $date: to.toISOString() } } } },
        { $group: { _id: "$companyId", sent: { $sum: 1 } } },
        { $sort: { sent: -1, _id: 1 } },
        { $limit: limit },
      ],
    })) as unknown as Array<Record<string, unknown>>;
    return raw.map((r) => ({ companyId: ejsonId(r._id), sent: num(r.sent) }));
  }
}
