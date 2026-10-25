import { env } from "../../../core/config";
import { logger } from "../../../infrastructure/logger";
import { redis } from "../../../infrastructure/redis";
import { cancelJob, enqueue, toSafeJobId } from "../../../infrastructure/queue";
import { QUIZ_COMMAND_JOB, QUIZ_QUEUE, quizCommandSchema, type IQuizScheduler, type QuizCommand } from "../entities/live-quiz.commands";

export { QUIZ_JOB, QUIZ_QUEUE, quizCommandSchema } from "../entities/live-quiz.commands";
export type { IQuizScheduler, QuizCommand } from "../entities/live-quiz.commands";

/**
 * Lệnh THỜI GIAN của phiên (đóng câu khi hết giờ, tự chuyển câu, host mất kết nối quá hạn). Mọi lệnh đều phát `quiz:*` nên PHẢI
 * chạy ở tiến trình có Socket.IO (API/`all`); tiến trình worker thuần không có `getIO()` (production mặc định `PROCESS_ROLE=api` + worker riêng)
 * nên job chỉ ĐÁNH THỨC tiến trình API qua Redis pub/sub — mọi instance API cùng nhận, nhưng Lua CAS (`close`/`advance`/`finish`) chỉ cho
 * đúng MỘT instance thắng và phát sự kiện.
 *
 * Hai lớp bảo hiểm: (1) timer trong tiến trình đã tạo lệnh (chính xác, không phụ thuộc pub/sub); (2) BullMQ delayed job bền (sống sót khi
 * instance đó chết) → `dispatch`. Cả hai idempotent nên chạy lặp vô hại. Độ trễ do NGƯỜI GỌI tính (đã gồm `answerGraceMs` cho `close`).
 */
export type QuizCommandExecutor = (cmd: QuizCommand) => Promise<void>;

/** `queueConnection` (ioredis, `maxRetriesPerRequest: null`) treo vô hạn khi Redis mất — mọi lời gọi BullMQ trên đường request PHẢI có trần thời gian. */
const QUEUE_TIMEOUT_MS = 1500;
const RESUBSCRIBE_MS = 5000;
const WAIT_REDIS_MS = 1000;
export const COMMAND_CHANNEL = `${env.REDIS_KEY_PREFIX}quiz:cmd`;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Quá ${ms}ms`)), ms);
    timer.unref();
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/** `quiz.question-deadline:quiz:{id}:{index}` (be.md §7) — qua `toSafeJobId` vì BullMQ từ chối `jobId` tự đặt có ≥ 3 dấu `:`; `cancel` dùng CÙNG hàm này. */
export function jobIdOf(cmd: QuizCommand): string {
  const part = cmd.type === "host-timeout" ? cmd.lastSeenMs : cmd.index;
  return toSafeJobId(`${QUIZ_COMMAND_JOB[cmd.type]}:quiz:${cmd.sessionId}:${part}`);
}

export class QuizCommandBus implements IQuizScheduler {
  private executor: QuizCommandExecutor | null = null;
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private subscriberStarted = false;
  private stopped = false;
  private subscribed = false;
  private sub: { disconnect(): Promise<void> } | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  /** Tiến trình API đặt bộ thực thi (`LiveQuizService.runCommand`); worker thuần không đặt. */
  setExecutor(executor: QuizCommandExecutor | null): void {
    this.executor = executor;
  }

  hasExecutor(): boolean {
    return this.executor !== null;
  }

  /** `true` khi đã đăng ký xong kênh lệnh (Redis xác nhận SUBSCRIBE) — test chờ điều kiện này thay vì ngủ cố định. */
  isSubscribed(): boolean {
    return this.subscribed;
  }

  async schedule(cmd: QuizCommand, delayMs: number): Promise<void> {
    const id = jobIdOf(cmd);
    const delay = Math.max(0, Math.round(delayMs));
    if (this.executor) {
      clearTimeout(this.timers.get(id));
      const timer = setTimeout(() => {
        this.timers.delete(id);
        void this.run(cmd);
      }, delay);
      timer.unref();
      this.timers.set(id, timer);
    }
    try {
      await withTimeout(
        enqueue(QUIZ_QUEUE, QUIZ_COMMAND_JOB[cmd.type], cmd, { jobId: id, delay, attempts: cmd.type === "host-timeout" ? 1 : 3 }),
        QUEUE_TIMEOUT_MS
      );
    } catch (err) {
      logger.warn("[live-quiz] Không xếp được job hẹn giờ (chỉ còn timer trong tiến trình)", { job: id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  async cancel(cmd: QuizCommand): Promise<void> {
    const id = jobIdOf(cmd);
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    try {
      await withTimeout(cancelJob(QUIZ_QUEUE, id), QUEUE_TIMEOUT_MS);
    } catch {
      // job đã chạy/không tồn tại/Redis chậm — processor tự no-op nhờ CAS, không cần báo lỗi
    }
  }

  /** Processor job gọi: chạy tại chỗ nếu tiến trình này có bộ thực thi (API/`all`), còn không thì đánh thức tiến trình API. */
  async dispatch(cmd: QuizCommand): Promise<void> {
    if (this.executor) {
      await this.executor(cmd);
      return;
    }
    const client = redis.getClient();
    // `isOpen` chỉ có nghĩa "đã gọi connect()", không phản ánh đang thật sự
    // dùng được (xem chú thích chi tiết ở `redis.client.ts`) — phải kiểm
    // `isReady`, nếu không `client.publish()` bên dưới treo tới khi `withTimeout` cắt.
    if (!client?.isReady) throw new Error("Redis không khả dụng — không đánh thức được tiến trình API");
    await withTimeout(client.publish(COMMAND_CHANNEL, JSON.stringify(cmd)), QUEUE_TIMEOUT_MS);
  }

  /** Chạy lệnh ở tiến trình này; lỗi chỉ log (timer/pub-sub không có ai để retry — job BullMQ là lớp bảo hiểm). */
  async run(cmd: QuizCommand): Promise<void> {
    if (!this.executor) return;
    try {
      await this.executor(cmd);
    } catch (err) {
      logger.warn("[live-quiz] Lệnh hẹn giờ lỗi", { cmd, error: err instanceof Error ? err.message : String(err) });
    }
  }

  /**
   * API: lắng kênh lệnh (nối lại + tự đăng ký lại khi Redis rớt — node-redis v4). Gọi lúc boot (`registerLiveQuizModule`), thử lại
   * mỗi 5 s nếu Redis chưa sẵn sàng — không chặn khởi động.
   */
  startSubscriber(): void {
    if (this.subscriberStarted) return;
    this.subscriberStarted = true;
    this.stopped = false;
    void this.connectSubscriber();
  }

  /** Dừng subscriber + xoá mọi timer trong tiến trình (test/tắt server). */
  async stop(): Promise<void> {
    this.stopped = true;
    this.subscriberStarted = false;
    this.subscribed = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    await this.sub?.disconnect().catch(() => undefined);
    this.sub = null;
  }

  private retryLater(ms: number): void {
    if (this.stopped) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.connectSubscriber();
    }, ms);
    this.retryTimer.unref();
  }

  private async connectSubscriber(): Promise<void> {
    if (this.stopped) return;
    let sub: NonNullable<ReturnType<typeof redis.getClient>> | null = null;
    try {
      // KHÔNG gọi `redis.connect()` ở đây: router được import TRƯỚC khi `server.ts` mở Redis, hai `connect()` chồng nhau làm client này bị đóng
      // giữa chừng. Chờ client chính sẵn sàng (do `server.ts` mở) rồi mới `duplicate()` cho kênh subscribe.
      const base = redis.getClient();
      if (!base?.isReady) {
        this.retryLater(WAIT_REDIS_MS);
        return;
      }
      sub = base.duplicate();
      sub.on("error", (err: Error) => logger.warn("[live-quiz] subscriber Redis lỗi", { error: err.message }));
      await sub.connect();
      if (this.stopped) {
        // `stop()` chạy trong lúc đang nối — không để lại client mồ côi.
        await sub.disconnect().catch(() => undefined);
        return;
      }
      await sub.subscribe(COMMAND_CHANNEL, (message) => {
        const parsed = quizCommandSchema.safeParse(safeJson(message));
        if (parsed.success) void this.run(parsed.data);
      });
      this.sub = sub;
      this.subscribed = true;
    } catch (err) {
      // Nối được nhưng SUBSCRIBE lỗi → đóng client dở dang trước khi thử lại (không tích luỹ client zombie).
      await sub?.disconnect().catch(() => undefined);
      logger.warn("[live-quiz] Chưa đăng ký được kênh lệnh, thử lại sau 5s", { error: err instanceof Error ? err.message : String(err) });
      this.retryLater(RESUBSCRIBE_MS);
    }
  }
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
