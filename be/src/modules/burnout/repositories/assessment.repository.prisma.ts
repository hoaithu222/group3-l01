import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { AckAction, AssessmentScoreInput, BurnoutAssessmentEntity } from "../entities/burnout.interface";
import type { WellbeingLevel } from "../domain/burnout-rules";
import type { RuleFactor } from "../domain/rule-evaluator";
import type { IBurnoutAssessmentRepository } from "./assessment.repository.interface";
import { isPrismaUniqueViolation, type TxHandle } from "./tx";

type AssessmentRecord = Awaited<ReturnType<typeof prisma.burnoutAssessment.findFirstOrThrow>>;

const isFactor = (raw: unknown): raw is RuleFactor => {
  if (typeof raw !== "object" || raw === null) return false;
  const f = raw as Record<string, unknown>;
  return (
    typeof f.ruleId === "string" &&
    typeof f.label === "string" &&
    typeof f.metric === "string" &&
    typeof f.aggregate === "string" &&
    typeof f.days === "number" &&
    typeof f.value === "number" &&
    typeof f.threshold === "number" &&
    typeof f.points === "number"
  );
};

/** `factors` là JSON tự do — phần tử hỏng bị bỏ thay vì làm hỏng cả danh sách lịch sử. */
const parseFactors = (raw: unknown): RuleFactor[] => (Array.isArray(raw) ? raw.filter(isFactor) : []);
const parseAck = (raw: string | null): AckAction | null => (raw === "DISMISS" || raw === "SNOOZE" ? raw : null);

const toEntity = (r: AssessmentRecord): BurnoutAssessmentEntity => ({
  id: r.id,
  userId: r.userId,
  date: r.date,
  riskScore: r.riskScore,
  level: r.level,
  factors: parseFactors(r.factors),
  ruleVersion: r.ruleVersion,
  alerted: r.alerted,
  alertedAt: r.alertedAt,
  ackAction: parseAck(r.ackAction),
  ackAt: r.ackAt,
  createdAt: r.createdAt,
});

export class PrismaBurnoutAssessmentRepository implements IBurnoutAssessmentRepository {
  async findOwned(id: string, userId: string): Promise<BurnoutAssessmentEntity | null> {
    const r = await prisma.burnoutAssessment.findFirst({ where: { id, userId } });
    return r ? toEntity(r) : null;
  }

  async findByDate(userId: string, date: string): Promise<BurnoutAssessmentEntity | null> {
    const r = await prisma.burnoutAssessment.findUnique({ where: { userId_date: { userId, date } } });
    return r ? toEntity(r) : null;
  }

  async upsertScore(input: AssessmentScoreInput): Promise<BurnoutAssessmentEntity> {
    const { userId, date, factors, ...rest } = input;
    // Chỉ các trường ĐIỂM — cố ý không đụng `alerted`/`ackAction` của bản đã có (chấm lại cùng ngày không được cảnh báo lần nữa).
    const score = { ...rest, factors: factors as unknown as Prisma.InputJsonArray };
    try {
      return toEntity(await prisma.burnoutAssessment.upsert({ where: { userId_date: { userId, date } }, create: { userId, date, ...score }, update: score }));
    } catch (err) {
      if (!isPrismaUniqueViolation(err)) throw err;
      return toEntity(await prisma.burnoutAssessment.update({ where: { userId_date: { userId, date } }, data: score }));
    }
  }

  async markAlerted(id: string, now: Date, tx?: TxHandle): Promise<boolean> {
    const res = await (tx ?? prisma).burnoutAssessment.updateMany({ where: { id, alerted: false }, data: { alerted: true, alertedAt: now } });
    return res.count === 1;
  }

  async acknowledge(id: string, userId: string, action: AckAction, now: Date, tx?: TxHandle): Promise<boolean> {
    const res = await (tx ?? prisma).burnoutAssessment.updateMany({ where: { id, userId, alerted: true, ackAction: null }, data: { ackAction: action, ackAt: now } });
    return res.count === 1;
  }

  async listSince(userId: string, fromDate: string): Promise<BurnoutAssessmentEntity[]> {
    const rows = await prisma.burnoutAssessment.findMany({ where: { userId, date: { gte: fromDate } }, orderBy: { date: "asc" } });
    return rows.map(toEntity);
  }

  async latest(userId: string): Promise<BurnoutAssessmentEntity | null> {
    const r = await prisma.burnoutAssessment.findFirst({ where: { userId }, orderBy: { date: "desc" } });
    return r ? toEntity(r) : null;
  }

  async deleteByUser(userId: string, tx?: TxHandle): Promise<number> {
    return (await (tx ?? prisma).burnoutAssessment.deleteMany({ where: { userId } })).count;
  }

  async deleteCreatedBefore(cutoff: Date): Promise<number> {
    return (await prisma.burnoutAssessment.deleteMany({ where: { createdAt: { lt: cutoff } } })).count;
  }

  async latestForUsers(userIds: readonly string[], sinceDate: string): Promise<Map<string, { level: WellbeingLevel; date: string }>> {
    if (userIds.length === 0) return new Map();
    // Mới → cũ; giữ bản GẶP ĐẦU TIÊN của mỗi user (= mới nhất) — không cần `groupBy` (Mongo không hỗ trợ lấy "hàng đầu mỗi nhóm" gọn).
    const rows = await prisma.burnoutAssessment.findMany({
      where: { userId: { in: [...userIds] }, date: { gte: sinceDate } },
      orderBy: { date: "desc" },
      select: { userId: true, level: true, date: true },
    });
    const out = new Map<string, { level: WellbeingLevel; date: string }>();
    for (const r of rows) if (!out.has(r.userId)) out.set(r.userId, { level: r.level, date: r.date });
    return out;
  }
}
