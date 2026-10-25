import type { AuthUser } from "../../../../core/types/express";
import { NotFoundError } from "../../../../core/exceptions";
import type { StudyItem, StudySet } from "../../../study/public";
import type { IQuizScheduler, QuizCommand } from "../../entities/live-quiz.commands";
import type {
  QuizEndedPayload,
  QuizLeaderboardPayload,
  QuizLobbyPayload,
  QuizMePayload,
  QuizProgressPayload,
  QuizQuestionPayload,
  QuizRevealPayload,
} from "../../entities/live-quiz.events";
import type { IQuizHostPresence } from "../../realtime/live-quiz.presence";
import type { IQuizEmitter } from "../../realtime/live-quiz.emitter";
import type { IQuizUserDirectory, IQuizWorkspaceAccess, QuizUserRef, QuizWorkspaceRole } from "../../repositories/ports";
import type { IQuizAudit } from "../../services/live-quiz.types";

/** ObjectId 24 hex tất định — DTO Zod (`objectIdSchema`) và Prisma đều cần đúng dạng này. */
export const oid = (n: number): string => n.toString(16).padStart(24, "0");
export const userOf = (id: string, role = "user"): AuthUser => ({ id, email: `${id}@e.com`, name: `U${id.slice(-3)}`, role });

export class FakeClock {
  t = 1_700_000_000_000;
  readonly now = (): number => this.t;
  advance(ms: number): void {
    this.t += ms;
  }
  set(ms: number): void {
    this.t = ms;
  }
}

export type SentEvent =
  | { event: "lobby"; to: string; payload: QuizLobbyPayload }
  | { event: "question"; to: string; payload: QuizQuestionPayload }
  | { event: "reveal"; to: string; payload: QuizRevealPayload }
  | { event: "leaderboard"; to: string; payload: QuizLeaderboardPayload }
  | { event: "me"; to: string; payload: QuizMePayload }
  | { event: "progress"; to: string; payload: QuizProgressPayload }
  | { event: "ended"; to: string; payload: QuizEndedPayload }
  | { event: "leave"; to: string; payload: { userIds: string[] } };

/** Emitter ghi lại mọi sự kiện đã "phát" (lobby/progress dựng bất đồng bộ — `flush()` đợi chúng xong). */
export class RecordingQuizEmitter implements IQuizEmitter {
  sent: SentEvent[] = [];
  private pending: Array<Promise<unknown>> = [];

  of<E extends SentEvent["event"]>(event: E): Array<Extract<SentEvent, { event: E }>> {
    return this.sent.filter((s): s is Extract<SentEvent, { event: E }> => s.event === event);
  }

  async flush(): Promise<void> {
    await Promise.all(this.pending);
    this.pending = [];
  }

  clear(): void {
    this.sent = [];
  }

  lobby(sessionId: string, build: () => Promise<QuizLobbyPayload>): void {
    this.pending.push(build().then((payload) => this.sent.push({ event: "lobby", to: `quiz:${sessionId}`, payload })));
  }
  progress(hostId: string, _sessionId: string, build: () => Promise<QuizProgressPayload>): void {
    this.pending.push(build().then((payload) => this.sent.push({ event: "progress", to: `user:${hostId}`, payload })));
  }
  question(sessionId: string, payload: QuizQuestionPayload): void {
    this.sent.push({ event: "question", to: `quiz:${sessionId}`, payload });
  }
  reveal(sessionId: string, payload: QuizRevealPayload): void {
    this.sent.push({ event: "reveal", to: `quiz:${sessionId}`, payload });
  }
  leaderboard(sessionId: string, payload: QuizLeaderboardPayload): void {
    this.sent.push({ event: "leaderboard", to: `quiz:${sessionId}`, payload });
  }
  me(userId: string, payload: QuizMePayload): void {
    this.sent.push({ event: "me", to: `user:${userId}`, payload });
  }
  ended(sessionId: string, payload: QuizEndedPayload): void {
    this.sent.push({ event: "ended", to: `quiz:${sessionId}`, payload });
  }
  leave(userIds: string[], sessionId: string): void {
    this.sent.push({ event: "leave", to: `quiz:${sessionId}`, payload: { userIds } });
  }
}

/** Ghi lại lệnh hẹn giờ/huỷ — test tự gọi `service.runCommand()` khi muốn "đến hạn". */
export class FakeScheduler implements IQuizScheduler {
  scheduled: Array<{ cmd: QuizCommand; delayMs: number }> = [];
  cancelled: QuizCommand[] = [];

  schedule(cmd: QuizCommand, delayMs: number): Promise<void> {
    this.scheduled.push({ cmd, delayMs });
    return Promise.resolve();
  }
  cancel(cmd: QuizCommand): Promise<void> {
    this.cancelled.push(cmd);
    return Promise.resolve();
  }
  last<T extends QuizCommand["type"]>(type: T): { cmd: Extract<QuizCommand, { type: T }>; delayMs: number } | undefined {
    const found = [...this.scheduled].reverse().find((s) => s.cmd.type === type);
    return found as { cmd: Extract<QuizCommand, { type: T }>; delayMs: number } | undefined;
  }
}

export class FakeAudit implements IQuizAudit {
  records: Array<Parameters<IQuizAudit["record"]>[0]> = [];
  record(input: Parameters<IQuizAudit["record"]>[0]): Promise<void> {
    this.records.push(input);
    return Promise.resolve();
  }
}

export class FakePresence implements IQuizHostPresence {
  connected = new Set<string>();
  failWith: Error | null = null;
  hostConnected(_sessionId: string, hostId: string): Promise<boolean> {
    if (this.failWith) return Promise.reject(this.failWith);
    return Promise.resolve(this.connected.has(hostId));
  }
}

export class FakeUsers implements IQuizUserDirectory {
  findMany(ids: string[]): Promise<Map<string, QuizUserRef>> {
    return Promise.resolve(new Map(ids.map((id) => [id, { id, name: `Người ${id.slice(-3)}`, avatarAssetId: null }])));
  }
}

export class FakeWorkspaces implements IQuizWorkspaceAccess {
  roles = new Map<string, QuizWorkspaceRole>();
  grant(workspaceId: string, userId: string, role: QuizWorkspaceRole): void {
    this.roles.set(`${workspaceId}:${userId}`, role);
  }
  roleOf(user: AuthUser, workspaceId: string): Promise<QuizWorkspaceRole | null> {
    return Promise.resolve(this.roles.get(`${workspaceId}:${user.id}`) ?? null);
  }
}

/** Câu trắc nghiệm 4 lựa chọn (`o_<i><k>`), đáp án đúng là lựa chọn số `correct`. */
export function mcItem(setId: string, ownerId: string, i: number, correct = 0): StudyItem {
  const options = [0, 1, 2, 3].map((k) => ({ id: `o_${i}${k}ab`, text: `Lựa chọn ${k} của câu ${i}`, mediaAssetId: null }));
  const at = new Date(0);
  return {
    id: oid(0x1000 + i),
    setId,
    ownerId,
    type: "MULTIPLE_CHOICE",
    prompt: `Câu hỏi số ${i}?`,
    answerText: null,
    options,
    correctOptionIds: [options[correct].id],
    acceptedAnswers: [],
    matchMode: "EXACT",
    explanation: `Giải thích câu ${i}`,
    frontMediaAssetId: null,
    backMediaAssetId: null,
    audioAssetId: null,
    tags: [],
    order: i,
    version: 1,
    createdAt: at,
    updatedAt: at,
  };
}

/** Đọc bộ học giả: chỉ CHỦ bộ đọc được (người khác → 404 như `StudySetAccess`). */
export class FakeContent {
  private readonly sets = new Map<string, { title: string; ownerId: string; items: StudyItem[] }>();

  addSet(ownerId: string, items: (setId: string) => StudyItem[], title = "Bộ thử"): string {
    const id = oid(0x2000 + this.sets.size);
    this.sets.set(id, { title, ownerId, items: items(id) });
    return id;
  }

  getViewableSet(user: AuthUser, setId: string): Promise<StudySet> {
    const s = this.sets.get(setId);
    if (!s || s.ownerId !== user.id) return Promise.reject(new NotFoundError());
    return Promise.resolve({ id: setId, title: s.title, ownerId: s.ownerId } as unknown as StudySet);
  }

  async listGradableItems(user: AuthUser, setId: string): Promise<StudyItem[]> {
    await this.getViewableSet(user, setId);
    return this.sets.get(setId)?.items ?? [];
  }
}
