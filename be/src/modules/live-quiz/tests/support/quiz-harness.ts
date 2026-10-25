import { AppError } from "../../../../core/exceptions";
import type { AuthUser } from "../../../../core/types/express";
import type { QuizSnapshot } from "../../entities/live-quiz.events";
import type { IQuizEmitter } from "../../realtime/live-quiz.emitter";
import type { IQuizHostPresence } from "../../realtime/live-quiz.presence";
import { InMemoryLiveQuizStore } from "../../redis/live-quiz.store.inmemory";
import { InMemoryLiveQuizRepository } from "../../repositories/live-quiz.repository.inmemory";
import { InMemoryQuizOutbox, InMemoryTxRunner } from "../../repositories/tx.inmemory";
import { LiveQuizService } from "../../services/live-quiz.service";
import { FakeAudit, FakeClock, FakeContent, FakePresence, FakeScheduler, FakeUsers, FakeWorkspaces, RecordingQuizEmitter, mcItem, oid, userOf } from "./quiz-fakes";

export const HOST = oid(1);
export const players = (n: number): string[] => Array.from({ length: n }, (_, i) => oid(100 + i));

export interface HarnessOptions {
  /** Thay emitter ghi lại bằng emitter khác (vd `SocketQuizEmitter` để test qua Socket.IO thật). */
  emitter?: IQuizEmitter;
  presence?: IQuizHostPresence;
  /** Đồng hồ của Redis (`TIME`) lệch đồng hồ máy API bấy nhiêu ms — kiểm hẹn giờ không phụ thuộc `Date.now()` của API. */
  storeClockSkewMs?: number;
}

/** Mọi deps in-memory + đồng hồ giả dùng chung cho store/repo/service — dựng lại cho MỖI test. */
export function makeHarness(opts: HarnessOptions = {}) {
  const clock = new FakeClock();
  const skew = opts.storeClockSkewMs ?? 0;
  const store = new InMemoryLiveQuizStore(() => clock.t + skew);
  const repo = new InMemoryLiveQuizRepository(clock.now);
  const outbox = new InMemoryQuizOutbox();
  const tx = new InMemoryTxRunner([repo, outbox]);
  const content = new FakeContent();
  const users = new FakeUsers();
  const workspaces = new FakeWorkspaces();
  const recorder = new RecordingQuizEmitter();
  const scheduler = new FakeScheduler();
  const audit = new FakeAudit();
  const fakePresence = new FakePresence();
  const service = new LiveQuizService({
    repo,
    store,
    content,
    users,
    workspaces,
    emitter: opts.emitter ?? recorder,
    tx,
    outbox,
    scheduler,
    audit,
    presence: opts.presence ?? fakePresence,
    now: clock.now,
  });
  // `emitter`/`presence` là bản ghi/giả để test assert; khi thay bằng bản thật thì chúng không được service dùng.
  return { clock, store, repo, outbox, tx, content, users, workspaces, emitter: recorder, scheduler, audit, presence: fakePresence, service };
}
export type Harness = ReturnType<typeof makeHarness>;

export interface Session {
  id: string;
  pin: string;
  host: AuthUser;
  player: (i: number) => AuthUser;
  playerIds: string[];
  /** Snapshot của host sau mỗi thao tác gần nhất (đã có `version` mới nhất). */
  snap: () => Promise<QuizSnapshot>;
}

export interface SessionOptions {
  questions?: number;
  count?: number;
  seconds?: number;
  autoAdvance?: boolean;
  playerCount?: number;
  /** Đáp án đúng của từng câu (chỉ số lựa chọn); mặc định câu nào cũng 0. */
  correct?: number[];
  workspaceId?: string;
}

/** Tạo bộ học + phiên WAITING và cho `playerCount` người vào phòng. */
export async function newSession(h: Harness, o: SessionOptions = {}): Promise<Session> {
  const host = userOf(HOST);
  const total = o.questions ?? 3;
  const setId = h.content.addSet(HOST, (id) => Array.from({ length: total }, (_, i) => mcItem(id, HOST, i, o.correct?.[i] ?? 0)));
  const { session, pin } = await h.service.create(host, {
    setId,
    count: o.count ?? total,
    secondsPerQuestion: o.seconds ?? 20,
    shuffle: false,
    autoAdvance: o.autoAdvance ?? false,
    ...(o.workspaceId ? { workspaceId: o.workspaceId } : {}),
  });
  const playerIds = players(o.playerCount ?? 2);
  for (const id of playerIds) await h.service.join(userOf(id), { pin });
  return { id: session.id, pin, host, playerIds, player: (i) => userOf(playerIds[i]), snap: () => h.service.get(host, session.id) };
}

/** Host `start`/`next` với `version` hiện tại. Trả snapshot mới của host. */
export async function advance(h: Harness, s: Session, mode: "start" | "next" = "next"): Promise<QuizSnapshot> {
  const { version } = await s.snap();
  return h.service.advance(s.host, s.id, mode, version);
}

/** Đặt đồng hồ giả tại `offsetMs` sau lúc câu hiện tại được mở. */
export async function at(h: Harness, s: Session, offsetMs: number): Promise<void> {
  const meta = await h.store.getMeta(s.id);
  h.clock.set((meta?.questionStartedAtMs ?? h.clock.t) + offsetMs);
}

/** Chạy `p`, trả `AppError` nó ném (thất bại nếu không ném hoặc ném lỗi khác) — để assert `errorCode`/`statusCode`. */
export async function errorOf(p: Promise<unknown>): Promise<AppError> {
  try {
    await p;
  } catch (err) {
    if (err instanceof AppError) return err;
    throw err;
  }
  throw new Error("Kỳ vọng ném AppError nhưng không có lỗi");
}
