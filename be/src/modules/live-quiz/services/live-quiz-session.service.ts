import { randomInt } from "crypto";
import { LIMITS } from "../../../core/constants/limits";
import type { AuthUser } from "../../../core/types/express";
import { newObjectId } from "../../../core/utils/object-id";
import type { CreateSessionDto, JoinDto } from "../dtos";
import type { QuizSnapshot } from "../entities/live-quiz.events";
import type { LiveQuizSession } from "../entities/live-quiz.interface";
import { quizErrors } from "../live-quiz.errors";
import { requireHost, requireMeta } from "./live-quiz-access";
import { eligibleQuestions, encodeCorrect, pickQuestions, toStoredQuestion } from "./live-quiz-question.picker";
import { buildLobby, buildSnapshot } from "./live-quiz-snapshot";
import type { LiveQuizDeps } from "./live-quiz.types";

/** Tạo phiên, vào phòng bằng PIN, xem snapshot, mời người chơi ra (be.md §5 create/join/kick). */
export class LiveQuizSessionService {
  constructor(
    private readonly d: LiveQuizDeps,
    private readonly now: () => number
  ) {}

  async create(user: AuthUser, dto: CreateSessionDto): Promise<{ session: LiveQuizSession; pin: string }> {
    const workspaceId = dto.workspaceId ?? null;
    if (workspaceId && !(await this.d.workspaces.roleOf(user, workspaceId))) throw quizErrors.notWorkspaceMember();
    const set = await this.d.content.getViewableSet(user, dto.setId);
    const pool = eligibleQuestions(await this.d.content.listGradableItems(user, dto.setId));
    if (pool.length < dto.count) throw quizErrors.notEnoughQuestions();
    const picked = pickQuestions(pool, dto.count, dto.shuffle);

    const id = newObjectId();
    const ttlSeconds = LIMITS.liveQuiz.pinTtlMinutes * 60;
    const pin = await this.claimPin(id, ttlSeconds);
    const scoring = { ...LIMITS.liveQuiz.scoring };
    try {
      const session = await this.d.repo.create({
        id,
        setId: dto.setId,
        setTitle: set.title,
        workspaceId,
        hostId: user.id,
        pin,
        questionOrder: picked.map((q) => q.item.id),
        secondsPerQuestion: dto.secondsPerQuestion,
        revealSeconds: LIMITS.liveQuiz.revealSeconds,
        autoAdvance: dto.autoAdvance,
        scoring,
      });
      await this.d.store.init({
        id,
        pin,
        meta: {
          hostId: user.id,
          workspaceId,
          setId: dto.setId,
          setTitle: set.title,
          total: picked.length,
          seconds: dto.secondsPerQuestion,
          revealSeconds: LIMITS.liveQuiz.revealSeconds,
          autoAdvance: dto.autoAdvance,
          base: scoring.base,
          bonus: scoring.speedBonus,
        },
        questions: picked.map(toStoredQuestion),
        corrects: picked.map((q) => encodeCorrect(q.correctIndex, q.item.options.length)),
        ttlSeconds,
      });
      return { session, pin };
    } catch (err) {
      await this.d.store.releasePin(pin);
      throw err;
    }
  }

  async join(user: AuthUser, dto: JoinDto): Promise<{ sessionId: string; snapshot: QuizSnapshot }> {
    const sessionId = await this.d.store.resolvePin(dto.pin);
    if (!sessionId) throw quizErrors.notFound();
    const meta = await requireMeta(this.d.store, sessionId);
    if (meta.workspaceId && !(await this.d.workspaces.roleOf(user, meta.workspaceId))) throw quizErrors.notWorkspaceMember();
    const ref = (await this.d.users.findMany([user.id])).get(user.id);
    const nickname = dto.nickname ?? ref?.name ?? "Người chơi";
    const res = await this.d.store.join(
      sessionId,
      { userId: user.id, nickname, avatarAssetId: ref?.avatarAssetId ?? null, joinedAtMs: this.now() },
      LIMITS.liveQuiz.playersMax
    );
    if (res.kind === "FULL") throw quizErrors.full(LIMITS.liveQuiz.playersMax);
    if (res.kind === "KICKED") throw quizErrors.kicked();
    if (res.kind === "ENDED") throw quizErrors.ended();
    if (res.kind === "GONE") throw quizErrors.notFound();
    if (res.kind === "JOINED") this.emitLobby(sessionId);
    return { sessionId, snapshot: await buildSnapshot(this.d.store, sessionId, user.id, this.now()) };
  }

  /** Snapshot cho host hoặc người chơi — người ngoài phiên nhận 404 (không lộ phiên tồn tại). */
  async get(user: AuthUser, sessionId: string): Promise<QuizSnapshot> {
    const meta = await requireMeta(this.d.store, sessionId);
    if (meta.hostId !== user.id && !(await this.d.store.hasPlayer(sessionId, user.id))) throw quizErrors.notFound();
    return buildSnapshot(this.d.store, sessionId, user.id, this.now());
  }

  /** Guard room socket `quiz:{id}` (be.md §6) — chỉ host hoặc người đã `join` qua REST. */
  async isParticipant(userId: string, sessionId: string): Promise<boolean> {
    const meta = await this.d.store.getMeta(sessionId);
    if (!meta) return false;
    return meta.hostId === userId || this.d.store.hasPlayer(sessionId, userId);
  }

  async kick(user: AuthUser, sessionId: string, userId: string): Promise<void> {
    await requireHost(this.d.store, user, sessionId);
    if (userId === user.id) throw quizErrors.invalidState();
    if (!(await this.d.store.kick(sessionId, userId))) throw quizErrors.notFound();
    this.d.emitter.leave([userId], sessionId);
    this.emitLobby(sessionId);
  }

  private emitLobby(sessionId: string): void {
    this.d.emitter.lobby(sessionId, () => buildLobby(this.d.store, sessionId, this.now()));
  }

  private async claimPin(sessionId: string, ttlSeconds: number): Promise<string> {
    for (let i = 0; i < LIMITS.liveQuiz.pinAttempts; i += 1) {
      const pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
      if (await this.d.store.claimPin(pin, sessionId, ttlSeconds)) return pin;
    }
    throw quizErrors.pinExhausted();
  }
}
