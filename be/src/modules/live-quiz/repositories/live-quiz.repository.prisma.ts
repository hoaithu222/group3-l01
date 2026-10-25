import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type {
  LiveQuizEndReasonValue,
  LiveQuizResult,
  LiveQuizResultCreateInput,
  LiveQuizScoring,
  LiveQuizSession,
  LiveQuizSessionCreateInput,
  LiveQuizStatusValue,
  QuizAnswerRecord,
} from "../entities/live-quiz.interface";
import type { AdminSessionListParams, ILiveQuizRepository, SessionCloseInput, SessionProgressMirror } from "./live-quiz.repository.interface";
import type { TxHandle } from "./tx";

type SessionRecord = Awaited<ReturnType<typeof prisma.liveQuizSession.findFirstOrThrow>>;
type ResultRecord = Awaited<ReturnType<typeof prisma.liveQuizResult.findFirstOrThrow>>;

export function toSession(r: SessionRecord): LiveQuizSession {
  return {
    id: r.id,
    setId: r.setId,
    setTitle: r.setTitle,
    workspaceId: r.workspaceId,
    hostId: r.hostId,
    pin: r.pin,
    status: r.status as LiveQuizStatusValue,
    questionOrder: r.questionOrder,
    currentIndex: r.currentIndex,
    questionStartedAt: r.questionStartedAt,
    deadlineAt: r.deadlineAt,
    secondsPerQuestion: r.secondsPerQuestion,
    revealSeconds: r.revealSeconds,
    autoAdvance: r.autoAdvance,
    scoring: r.scoring as unknown as LiveQuizScoring,
    playersCount: r.playersCount,
    version: r.version,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    endReason: r.endReason as LiveQuizEndReasonValue | null,
    resultsPersistedAt: r.resultsPersistedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function toResult(r: ResultRecord): LiveQuizResult {
  return {
    id: r.id,
    sessionId: r.sessionId,
    userId: r.userId,
    nickname: r.nickname,
    score: r.score,
    correct: r.correct,
    answered: r.answered,
    rank: r.rank,
    answers: r.answers as unknown as QuizAnswerRecord[],
    createdAt: r.createdAt,
  };
}

/** Phiên còn mở — dùng cho mọi CAS đóng phiên. */
const OPEN_STATUSES: LiveQuizStatusValue[] = ["WAITING", "IN_PROGRESS"];

export class PrismaLiveQuizRepository implements ILiveQuizRepository {
  private db(tx?: TxHandle): TxHandle | typeof prisma {
    return tx ?? prisma;
  }

  async create(input: LiveQuizSessionCreateInput): Promise<LiveQuizSession> {
    const row = await prisma.liveQuizSession.create({
      data: {
        id: input.id,
        setId: input.setId,
        setTitle: input.setTitle,
        workspaceId: input.workspaceId,
        hostId: input.hostId,
        pin: input.pin,
        status: "WAITING",
        questionOrder: input.questionOrder,
        currentIndex: -1,
        secondsPerQuestion: input.secondsPerQuestion,
        revealSeconds: input.revealSeconds,
        autoAdvance: input.autoAdvance,
        scoring: input.scoring as unknown as Prisma.InputJsonValue,
        // Mongo: field vắng mặt KHÔNG khớp `{ field: null }` — ghi null tường minh cho mọi trường sau này lọc bằng null.
        questionStartedAt: null,
        deadlineAt: null,
        startedAt: null,
        endedAt: null,
        endReason: null,
        resultsPersistedAt: null,
      },
    });
    return toSession(row);
  }

  async findById(id: string): Promise<LiveQuizSession | null> {
    const row = await prisma.liveQuizSession.findUnique({ where: { id } });
    return row ? toSession(row) : null;
  }

  async mirrorProgress(id: string, m: SessionProgressMirror): Promise<void> {
    await prisma.liveQuizSession.updateMany({
      where: { id, version: { lt: m.version }, status: { in: OPEN_STATUSES } },
      data: {
        version: m.version,
        status: m.status,
        currentIndex: m.currentIndex,
        questionStartedAt: m.questionStartedAt,
        deadlineAt: m.deadlineAt,
        ...(m.startedAt ? { startedAt: m.startedAt } : {}),
      },
    });
  }

  async closeIfOpen(id: string, input: SessionCloseInput, tx?: TxHandle): Promise<boolean> {
    const r = await this.db(tx).liveQuizSession.updateMany({
      where: { id, status: { in: OPEN_STATUSES } },
      data: {
        status: input.status,
        endReason: input.endReason,
        endedAt: input.endedAt,
        version: input.version,
        playersCount: input.playersCount,
      },
    });
    return r.count === 1;
  }

  async markPersistedIf(id: string, at: Date, tx?: TxHandle): Promise<boolean> {
    const r = await this.db(tx).liveQuizSession.updateMany({
      // `null` khớp cả trường vắng mặt ở Mongo? KHÔNG — nên chấp nhận cả `isSet: false` (phiên tạo bởi đường không ghi null).
      where: { id, status: "FINISHED", OR: [{ resultsPersistedAt: null }, { resultsPersistedAt: { isSet: false } }] },
      data: { resultsPersistedAt: at },
    });
    return r.count === 1;
  }

  async createResults(rows: LiveQuizResultCreateInput[], tx?: TxHandle): Promise<void> {
    if (rows.length === 0) return;
    await this.db(tx).liveQuizResult.createMany({
      data: rows.map((r) => ({
        sessionId: r.sessionId,
        userId: r.userId,
        nickname: r.nickname,
        score: r.score,
        correct: r.correct,
        answered: r.answered,
        rank: r.rank,
        answers: r.answers as unknown as Prisma.InputJsonValue,
      })),
    });
  }

  async listResults(sessionId: string): Promise<LiveQuizResult[]> {
    const rows = await prisma.liveQuizResult.findMany({ where: { sessionId }, orderBy: { rank: "asc" } });
    return rows.map(toResult);
  }

  async findResult(sessionId: string, userId: string): Promise<LiveQuizResult | null> {
    const row = await prisma.liveQuizResult.findUnique({ where: { sessionId_userId: { sessionId, userId } } });
    return row ? toResult(row) : null;
  }

  async listResultsByUser(userId: string, after: { at: Date; id: string } | null, limit: number): Promise<LiveQuizResult[]> {
    const where: Prisma.LiveQuizResultWhereInput = { userId };
    if (after) where.OR = [{ createdAt: { lt: after.at } }, { createdAt: after.at, id: { lt: after.id } }];
    const rows = await prisma.liveQuizResult.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit });
    return rows.map(toResult);
  }

  async findByIds(ids: string[]): Promise<LiveQuizSession[]> {
    if (ids.length === 0) return [];
    const rows = await prisma.liveQuizSession.findMany({ where: { id: { in: ids } } });
    return rows.map(toSession);
  }

  async findStale(waitingBefore: Date, inProgressBefore: Date, limit: number): Promise<LiveQuizSession[]> {
    const rows = await prisma.liveQuizSession.findMany({
      where: { OR: [{ status: "WAITING", updatedAt: { lt: waitingBefore } }, { status: "IN_PROGRESS", updatedAt: { lt: inProgressBefore } }] },
      orderBy: { updatedAt: "asc" },
      take: limit,
    });
    return rows.map(toSession);
  }

  async adminList(p: AdminSessionListParams): Promise<{ items: LiveQuizSession[]; total: number }> {
    const where: Prisma.LiveQuizSessionWhereInput = p.status ? { status: p.status } : {};
    const [rows, total] = await Promise.all([
      prisma.liveQuizSession.findMany({ where, orderBy: { createdAt: "desc" }, skip: (p.page - 1) * p.limit, take: p.limit }),
      prisma.liveQuizSession.count({ where }),
    ]);
    return { items: rows.map(toSession), total };
  }
}
