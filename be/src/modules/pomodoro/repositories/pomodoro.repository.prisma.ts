import { Prisma, type PomodoroPresence, type PomodoroSession } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type {
  NewPomodoroSession,
  PomodoroHistoryRow,
  PomodoroPresenceEntity,
  PomodoroSessionEntity,
  PomodoroSessionPatch,
} from "../entities/pomodoro.interface";
import { normalizePomodoroConfig } from "../services/pomodoro-config";
import {
  PomodoroActiveConflictError,
  type HistoryCursor,
  type IPomodoroRepository,
  type JoinMark,
  type SessionCas,
} from "./pomodoro.repository.interface";
import type { TxHandle } from "./tx";

const RUNNING = ["FOCUS", "SHORT_BREAK", "LONG_BREAK"] as const;
const isUniqueViolation = (err: unknown): boolean => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

function toSession(row: PomodoroSession): PomodoroSessionEntity {
  return { ...row, config: normalizePomodoroConfig(row.config) };
}

const toPresence = (row: PomodoroPresence): PomodoroPresenceEntity => ({
  id: row.id,
  sessionId: row.sessionId,
  userId: row.userId,
  joinedAt: row.joinedAt,
  leftAt: row.leftAt,
  presentSeconds: row.presentSeconds,
  cyclesAttended: row.cyclesAttended,
  interruptions: row.interruptions,
  goal: row.goal,
  goalShared: row.goalShared,
});

const secondsBetween = (from: Date, to: Date): number => Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000));

/** Repository Prisma/Mongo — CAS bằng `updateMany({ id, version[, phase] })` (đếm 0 = thua). Mọi trường nullable ghi null TƯỜNG MINH lúc tạo. */
export class PrismaPomodoroRepository implements IPomodoroRepository {
  private db(tx?: TxHandle): Prisma.TransactionClient | typeof prisma {
    return tx ?? prisma;
  }

  async findById(id: string, tx?: TxHandle): Promise<PomodoroSessionEntity | null> {
    const row = await this.db(tx).pomodoroSession.findUnique({ where: { id } });
    return row ? toSession(row) : null;
  }

  async findActiveByChannel(channelId: string, tx?: TxHandle): Promise<PomodoroSessionEntity | null> {
    const row = await this.db(tx).pomodoroSession.findFirst({ where: { activeKey: channelId } });
    return row ? toSession(row) : null;
  }

  async findByCallId(callId: string): Promise<PomodoroSessionEntity | null> {
    const row = await prisma.pomodoroSession.findFirst({ where: { callId }, orderBy: { createdAt: "desc" } });
    return row ? toSession(row) : null;
  }

  async listOverdueRunning(before: Date, limit: number): Promise<PomodoroSessionEntity[]> {
    // `lte` trên trường nullable khớp cả null (Prisma+Mongo) ⇒ thêm `not: null`.
    const rows = await prisma.pomodoroSession.findMany({
      where: { phase: { in: [...RUNNING] }, phaseEndsAt: { lte: before, not: null } },
      orderBy: { phaseEndsAt: "asc" },
      take: limit,
    });
    return rows.map(toSession);
  }

  async listActive(limit: number): Promise<PomodoroSessionEntity[]> {
    const rows = await prisma.pomodoroSession.findMany({ where: { phase: { not: "ENDED" } }, orderBy: { createdAt: "asc" }, take: limit });
    return rows.map(toSession);
  }

  async createSession(tx: TxHandle | undefined, s: NewPomodoroSession): Promise<PomodoroSessionEntity> {
    try {
      const row = await this.db(tx).pomodoroSession.create({
        data: { ...s, config: s.config as unknown as Prisma.InputJsonValue, activeKey: s.channelId, version: 1 },
      });
      return toSession(row);
    } catch (err) {
      if (isUniqueViolation(err)) throw new PomodoroActiveConflictError();
      throw err;
    }
  }

  async updateSession(tx: TxHandle | undefined, id: string, cas: SessionCas, patch: PomodoroSessionPatch): Promise<PomodoroSessionEntity | null> {
    const { config, ...rest } = patch;
    const res = await this.db(tx).pomodoroSession.updateMany({
      where: { id, version: cas.version, ...(cas.phase ? { phase: cas.phase } : {}) },
      data: {
        ...rest,
        ...(config ? { config: config as unknown as Prisma.InputJsonValue } : {}),
        ...(patch.phase === "ENDED" ? { activeKey: `ended:${id}` } : {}),
        version: { increment: 1 },
      },
    });
    return res.count === 0 ? null : this.findById(id, tx);
  }

  async linkCall(id: string, callId: string): Promise<void> {
    await prisma.pomodoroSession.updateMany({ where: { id }, data: { callId } });
  }

  async findPresence(sessionId: string, userId: string): Promise<PomodoroPresenceEntity | null> {
    const row = await prisma.pomodoroPresence.findUnique({ where: { sessionId_userId: { sessionId, userId } } });
    return row ? toPresence(row) : null;
  }

  async listPresence(sessionId: string): Promise<PomodoroPresenceEntity[]> {
    const rows = await prisma.pomodoroPresence.findMany({ where: { sessionId }, orderBy: { joinedAt: "asc" } });
    return rows.map(toPresence);
  }

  async markJoined(sessionId: string, userId: string, at: Date): Promise<JoinMark> {
    const existing = await this.findPresence(sessionId, userId);
    if (!existing) {
      try {
        await prisma.pomodoroPresence.create({
          data: { sessionId, userId, joinedAt: at, leftAt: null, presentSeconds: 0, cyclesAttended: 0, interruptions: 0, goal: null, goalShared: false },
        });
        return "CREATED";
      } catch (err) {
        if (isUniqueViolation(err)) return "NOOP"; // hai webhook cùng lúc — bên kia đã tạo
        throw err;
      }
    }
    if (existing.leftAt === null) return "NOOP";
    const res = await prisma.pomodoroPresence.updateMany({
      where: { id: existing.id, leftAt: { not: null } },
      data: { leftAt: null, joinedAt: at, interruptions: { increment: 1 } },
    });
    return res.count > 0 ? "REJOINED" : "NOOP";
  }

  async markLeft(sessionId: string, userId: string, at: Date): Promise<boolean> {
    const existing = await this.findPresence(sessionId, userId);
    if (!existing || existing.leftAt !== null) return false;
    const res = await prisma.pomodoroPresence.updateMany({
      where: { id: existing.id, leftAt: null },
      data: { leftAt: at, presentSeconds: { increment: secondsBetween(existing.joinedAt, at) } },
    });
    return res.count > 0;
  }

  async incrementCyclesAttended(tx: TxHandle | undefined, sessionId: string, phaseStartedAt: Date): Promise<number> {
    const res = await this.db(tx).pomodoroPresence.updateMany({
      where: { sessionId, leftAt: null, joinedAt: { lte: phaseStartedAt } },
      data: { cyclesAttended: { increment: 1 } },
    });
    return res.count;
  }

  async finalizePresence(tx: TxHandle | undefined, sessionId: string, at: Date): Promise<void> {
    const client = this.db(tx);
    const open = await client.pomodoroPresence.findMany({ where: { sessionId, leftAt: null } });
    for (const row of open) {
      await client.pomodoroPresence.updateMany({
        where: { id: row.id, leftAt: null },
        data: { leftAt: at, presentSeconds: { increment: secondsBetween(row.joinedAt, at) } },
      });
    }
  }

  async setGoal(sessionId: string, userId: string, at: Date, goal: string | null, shared: boolean): Promise<PomodoroPresenceEntity> {
    await this.markJoined(sessionId, userId, at); // người đã ở trong phòng nhưng webhook chưa tới: tạo dòng hiện diện trước
    const row = await prisma.pomodoroPresence.update({ where: { sessionId_userId: { sessionId, userId } }, data: { goal, goalShared: goal ? shared : false } });
    return toPresence(row);
  }

  async listHistory(userId: string, cursor: HistoryCursor | null, limit: number): Promise<PomodoroHistoryRow[]> {
    const rows = await prisma.pomodoroPresence.findMany({
      where: cursor ? { userId, OR: [{ joinedAt: { lt: cursor.at } }, { joinedAt: cursor.at, id: { lt: cursor.id } }] } : { userId },
      orderBy: [{ joinedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const sessions = await prisma.pomodoroSession.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.sessionId))] } } });
    const byId = new Map(sessions.map((s) => [s.id, toSession(s)]));
    return rows.flatMap((r) => {
      const session = byId.get(r.sessionId);
      return session ? [{ presence: toPresence(r), session }] : [];
    });
  }
}
