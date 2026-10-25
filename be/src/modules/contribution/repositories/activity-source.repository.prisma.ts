import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { ActivityKind, ActivityScope, IActivitySourceRepository, SourceCount } from "./activity-source.repository.interface";

/** Extended JSON của `aggregateRaw`: ObjectId → `{ $oid }`, ngày → `{ $date }`. */
const oid = (id: string) => ({ $oid: id });
const date = (d: Date) => ({ $date: d.toISOString() });

interface RawGroup {
  _id: { u: unknown; d: string; k: string };
  n: number;
}

const idOf = (v: unknown): string => (typeof v === "object" && v !== null && "$oid" in v ? String((v as { $oid: string }).$oid) : String(v));

const dayOf = (field: string, timezone: string) => ({ $dateToString: { format: "%Y-%m-%d", date: field, timezone } });

function toCounts(raw: Prisma.JsonObject, kindOf: (k: string) => ActivityKind): SourceCount[] {
  return (raw as unknown as RawGroup[]).map((g) => ({ userId: idOf(g._id.u), date: g._id.d, kind: kindOf(g._id.k), count: g.n }));
}

export class PrismaActivitySourceRepository implements IActivitySourceRepository {
  async countTaskActivity(scope: ActivityScope, from: Date, to: Date, timezone: string): Promise<SourceCount[]> {
    const raw = await prisma.taskActivity.aggregateRaw({
      pipeline: [
        {
          $match: {
            workspaceId: oid(scope.workspaceId),
            boardId: oid(scope.boardId),
            actorId: { $ne: null },
            type: { $ne: "COMMENT_DELETED_BY_ADMIN" },
            at: { $gte: date(from), $lt: date(to) },
          },
        },
        {
          $group: {
            _id: {
              u: "$actorId",
              d: dayOf("$at", timezone),
              k: { $cond: [{ $eq: [{ $substrCP: ["$type", 0, 10] }, "CHECKLIST_"] }, "checklist", "task"] },
            },
            n: { $sum: 1 },
          },
        },
      ],
    });
    return toCounts(raw, (k) => (k === "checklist" ? "checklist" : "task"));
  }

  async countComments(scope: ActivityScope, from: Date, to: Date, timezone: string): Promise<SourceCount[]> {
    const raw = await prisma.taskComment.aggregateRaw({
      pipeline: [
        { $match: { workspaceId: oid(scope.workspaceId), boardId: oid(scope.boardId), deletedAt: null, createdAt: { $gte: date(from), $lt: date(to) } } },
        { $group: { _id: { u: "$authorId", d: dayOf("$createdAt", timezone), k: "comment" }, n: { $sum: 1 } } },
      ],
    });
    return toCounts(raw, () => "comment");
  }

  async countReviews(scope: ActivityScope, from: Date, to: Date, timezone: string): Promise<SourceCount[]> {
    const raw = await prisma.contributionReviewFact.aggregateRaw({
      pipeline: [
        { $match: { workspaceId: oid(scope.workspaceId), boardId: oid(scope.boardId), submittedAt: { $gte: date(from), $lt: date(to) } } },
        { $group: { _id: { u: "$reviewerId", d: dayOf("$submittedAt", timezone), k: "review" }, n: { $sum: 1 } } },
      ],
    });
    return toCounts(raw, () => "review");
  }
}
