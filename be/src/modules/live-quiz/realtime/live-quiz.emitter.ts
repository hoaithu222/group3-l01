import { logger } from "../../../infrastructure/logger";
import { ROOM } from "../../../infrastructure/socket/socket.rooms";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { emitToRoom, emitToUsers, leaveRooms } from "../../../infrastructure/socket/socket.emit";
import type {
  QuizEndedPayload,
  QuizLeaderboardPayload,
  QuizLobbyPayload,
  QuizMePayload,
  QuizProgressPayload,
  QuizQuestionPayload,
  QuizRevealPayload,
} from "../entities/live-quiz.events";

/** Cửa sổ throttle `quiz:lobby` (be.md §6: 500 ms) và `quiz:progress` — phát ngay lượt đầu, gộp các lượt trong cửa sổ thành MỘT lượt cuối. */
const THROTTLE_MS = 500;

/**
 * Cổng phát realtime của live quiz — bản socket thật bên dưới; bản giả cho unit test.
 * BEST-EFFORT: tiến trình worker thuần không có `getIO()` — mọi emit sinh từ job đi qua `QuizCommandBus` để chạy ở tiến trình API
 * (`live-quiz.command-bus.ts`); lỗi phát chỉ log — client vẫn đồng bộ lại bằng `GET /live-quiz/:id`.
 */
export interface IQuizEmitter {
  /** `build` chạy lúc thực sự phát (đọc trạng thái MỚI NHẤT), không phải lúc gọi. Payload KHÔNG có `pin`. */
  lobby(sessionId: string, build: () => Promise<QuizLobbyPayload>): void;
  question(sessionId: string, payload: QuizQuestionPayload): void;
  reveal(sessionId: string, payload: QuizRevealPayload): void;
  leaderboard(sessionId: string, payload: QuizLeaderboardPayload): void;
  /** Hạng riêng của từng người chơi (`user:{id}`). */
  me(userId: string, payload: QuizMePayload): void;
  /** Số người đã trả lời — chỉ tới host (`user:{hostId}`), throttle theo phiên. */
  progress(hostId: string, sessionId: string, build: () => Promise<QuizProgressPayload>): void;
  ended(sessionId: string, payload: QuizEndedPayload): void;
  /** Đá mọi thiết bị của các user khỏi room (`kick`). */
  leave(userIds: string[], sessionId: string): void;
}

/** Leading + trailing throttle theo khoá: lượt đầu chạy ngay; các lượt trong cửa sổ gộp thành một lượt cuối khi hết cửa sổ. */
class KeyedThrottle {
  private readonly slots = new Map<string, { dirty: boolean }>();

  constructor(private readonly windowMs: number) {}

  run(key: string, fire: () => void): void {
    const slot = this.slots.get(key);
    if (slot) {
      slot.dirty = true;
      return;
    }
    fire();
    this.slots.set(key, { dirty: false });
    setTimeout(() => {
      const settled = this.slots.get(key);
      this.slots.delete(key);
      if (settled?.dirty) this.run(key, fire);
    }, this.windowMs).unref();
  }
}

export class SocketQuizEmitter implements IQuizEmitter {
  private readonly throttle = new KeyedThrottle(THROTTLE_MS);

  private safe(what: string, fn: () => void): void {
    try {
      fn();
    } catch (err) {
      logger.debug("[live-quiz] Không phát được sự kiện socket", { what, error: err instanceof Error ? err.message : String(err) });
    }
  }

  private fire<T extends object>(what: string, build: () => Promise<T>, send: (payload: T) => void): void {
    void build()
      .then((payload) => this.safe(what, () => send(payload)))
      .catch((err: unknown) => logger.debug("[live-quiz] Dựng payload lỗi", { what, error: err instanceof Error ? err.message : String(err) }));
  }

  lobby(sessionId: string, build: () => Promise<QuizLobbyPayload>): void {
    this.throttle.run(`lobby:${sessionId}`, () =>
      this.fire(SocketEvent.QUIZ_LOBBY, build, (p) => emitToRoom(ROOM.quiz(sessionId), SocketEvent.QUIZ_LOBBY, p))
    );
  }

  progress(hostId: string, sessionId: string, build: () => Promise<QuizProgressPayload>): void {
    this.throttle.run(`progress:${sessionId}`, () =>
      this.fire(SocketEvent.QUIZ_PROGRESS, build, (p) => emitToUsers([hostId], SocketEvent.QUIZ_PROGRESS, p))
    );
  }

  question(sessionId: string, payload: QuizQuestionPayload): void {
    this.safe(SocketEvent.QUIZ_QUESTION, () => emitToRoom(ROOM.quiz(sessionId), SocketEvent.QUIZ_QUESTION, payload));
  }

  reveal(sessionId: string, payload: QuizRevealPayload): void {
    this.safe(SocketEvent.QUIZ_REVEAL, () => emitToRoom(ROOM.quiz(sessionId), SocketEvent.QUIZ_REVEAL, payload));
  }

  leaderboard(sessionId: string, payload: QuizLeaderboardPayload): void {
    this.safe(SocketEvent.QUIZ_LEADERBOARD, () => emitToRoom(ROOM.quiz(sessionId), SocketEvent.QUIZ_LEADERBOARD, payload));
  }

  me(userId: string, payload: QuizMePayload): void {
    this.safe(`${SocketEvent.QUIZ_LEADERBOARD}:me`, () => emitToUsers([userId], SocketEvent.QUIZ_LEADERBOARD, payload));
  }

  ended(sessionId: string, payload: QuizEndedPayload): void {
    this.safe(SocketEvent.QUIZ_ENDED, () => emitToRoom(ROOM.quiz(sessionId), SocketEvent.QUIZ_ENDED, payload));
  }

  leave(userIds: string[], sessionId: string): void {
    this.safe("leave", () => leaveRooms(userIds, [ROOM.quiz(sessionId)]));
  }
}

/** Bản không làm gì — dùng cho worker/sweeper khi cố ý không phát. */
export class NoopQuizEmitter implements IQuizEmitter {
  lobby(): void {}
  question(): void {}
  reveal(): void {}
  leaderboard(): void {}
  me(): void {}
  progress(): void {}
  ended(): void {}
  leave(): void {}
}
