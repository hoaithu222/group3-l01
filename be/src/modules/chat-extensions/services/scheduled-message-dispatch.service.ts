import { AppError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";
import { logger } from "../../../infrastructure/logger";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import type { IMessageSendPort, PortMessageView } from "../../../shared/ports/message-send.port";
import type { ScheduledFailReason, ScheduledMessageEntity } from "../entities/chat-extensions.types";
import type { IChatDirectory } from "../repositories/chat-directory.interface";
import type { IScheduledMessageRepository } from "../repositories/scheduled-message.repository.interface";
import type { ITxRunner } from "../repositories/tx";
import { getChatExtLimits, type ChatExtLimits } from "./chat-extensions-limits";
import type { IChatEmitter, IChatNotifier, IScheduledAssetPort } from "./chat-extensions-ports";
import { toScheduledUpdatedPayload } from "./scheduled-message.presenter";

export interface ScheduledMessageDispatchDeps {
  scheduled: IScheduledMessageRepository;
  sender: IMessageSendPort;
  directory: Pick<IChatDirectory, "users">;
  assets: IScheduledAssetPort;
  notifier: IChatNotifier;
  emitter: IChatEmitter;
  tx: ITxRunner;
  /** Cờ phụ `scheduledMessages` còn bật? — tắt sau khi hẹn ⇒ tin thất bại `SUB_FEATURE_OFF` (job đang chờ vẫn chạy, be.md §5.7). */
  subFeatureEnabled: () => Promise<boolean>;
  limits?: () => Promise<ChatExtLimits>;
  now?: () => Date;
}

export type DispatchOutcome =
  /** Đã tạo `Message` (hoặc engine trả tin cũ nhờ idempotency) và chuyển `SENT`. */
  | { kind: "SENT"; scheduled: ScheduledMessageEntity; message: PortMessageView }
  /** Không phát được vì lý do nghiệp vụ — đã chuyển `FAILED` + thông báo tác giả. */
  | { kind: "FAILED"; scheduled: ScheduledMessageEntity }
  /** Job trùng / bản ghi đã đổi giờ/nội dung (`version` khác) / đã huỷ / đã có tiến trình khác nhận — không làm gì. */
  | { kind: "SKIPPED"; reason: "STALE" };

interface FailureClass {
  /** `true` = lỗi hạ tầng tạm thời: trả về `PENDING` rồi ném để BullMQ thử lại. */
  retry: boolean;
  reason: ScheduledFailReason;
  code: string | null;
}

/**
 * Phát tin hẹn giờ (p7-04 be.md §5.3, job `scheduled-message.send`): claim CAS theo `version` (chạy hai lần chỉ một lần thắng — SCHED-02; đổi giờ → job cũ không khớp — SCHED-03), kiểm LẠI
 * cờ phụ/tác giả `ACTIVE`/quyền gửi lúc phát (SCHED-01), gửi qua `IMessageSendPort` với `clientMessageId = "sched:<id>"` (engine đảm bảo một `Message` dù job chạy lại), rồi `SENT`.
 * Lỗi nghiệp vụ → `FAILED` + `notify` (không kèm nội dung tin); lỗi hạ tầng → về `PENDING` và ném để BullMQ thử lại, hết lượt → `FAILED UNKNOWN`. Worker chết giữa chừng: bản ghi kẹt `SENDING`
 * quá `staleSendingSeconds` được cron quét bù nhận lại và phát tiếp (idempotent nhờ `clientMessageId`).
 */
export class ScheduledMessageDispatchService {
  constructor(private readonly d: ScheduledMessageDispatchDeps) {}

  private now(): Date {
    return this.d.now?.() ?? new Date();
  }

  async dispatch(input: { id: string; version: number }): Promise<DispatchOutcome> {
    const limits = await (this.d.limits ?? getChatExtLimits)();
    const now = this.now();
    const staleBefore = new Date(now.getTime() - limits.scheduled.staleSendingSeconds * 1000);
    const claimed = await this.d.scheduled.claimForSend(input.id, input.version, staleBefore);
    if (!claimed) return { kind: "SKIPPED", reason: "STALE" };

    if (!(await this.d.subFeatureEnabled())) return this.fail(claimed, "SUB_FEATURE_OFF", null);

    // Tác giả bị khoá/đang xoá/đã ẩn danh: không phát; xoá luôn nội dung/tệp/mention (không giữ dữ liệu của tài khoản đã đi).
    const author = (await this.d.directory.users([claimed.authorId])).get(claimed.authorId);
    if (!author || author.status !== "ACTIVE") return this.fail(claimed, "AUTHOR_INACTIVE", null, true);

    const access = await this.d.sender.canWrite(claimed.authorId, claimed.scopeType, claimed.scopeId);
    if (!access.readable || !access.allowed) return this.fail(claimed, "NO_PERMISSION", null);

    let sent;
    try {
      sent = await this.d.sender.send({
        authorId: claimed.authorId,
        scopeType: claimed.scopeType,
        scopeId: claimed.scopeId,
        ...(claimed.threadId ? { threadId: claimed.threadId } : {}),
        clientMessageId: `sched:${claimed.id}`,
        ...(claimed.content !== null ? { content: claimed.content } : {}),
        mentions: claimed.mentions,
        attachmentAssetIds: claimed.attachmentAssetIds,
        ...(claimed.replyToId ? { replyToId: claimed.replyToId } : {}),
      });
    } catch (err) {
      const failure = this.classify(err);
      if (!failure.retry) return this.fail(claimed, failure.reason, failure.code);
      // Hết lượt thử: kết luận thất bại thay vì để tin `PENDING` mãi (BullMQ sẽ không thử nữa).
      if (claimed.attempts >= limits.scheduled.sendRetries) return this.fail(claimed, "UNKNOWN", null);
      await this.d.scheduled.revertToPending(claimed.id);
      logger.warn("[chat-extensions] Phát tin hẹn giờ gặp lỗi hạ tầng, sẽ thử lại", { scheduledMessageId: claimed.id, attempts: claimed.attempts, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }

    const done = await this.d.tx.run(async (tx) => {
      const next = await this.d.scheduled.markSent(claimed.id, { messageId: sent.view.id, at: this.now() }, tx);
      if (next) await this.d.assets.detach(tx, { scheduledMessageId: claimed.id });
      return next;
    });
    const scheduled = done ?? (await this.d.scheduled.findById(claimed.id)) ?? claimed;
    this.emitUpdated(scheduled);
    return { kind: "SENT", scheduled, message: sent.view };
  }

  /**
   * Kết luận thất bại nghiệp vụ: `SENDING → FAILED` (kèm lý do/mã lỗi engine), gỡ liên kết tệp, `notify` tác giả — CÙNG một transaction (thông báo bền cùng trạng thái); rồi phát socket.
   * `scrub` xoá nội dung/tệp/mention (tác giả không còn hoạt động).
   */
  private async fail(claimed: ScheduledMessageEntity, reason: ScheduledFailReason, code: string | null, scrub = false): Promise<DispatchOutcome> {
    const failed = await this.d.tx.run(async (tx) => {
      const next = await this.d.scheduled.markFailed(claimed.id, { reason, code, scrub }, tx);
      if (!next) return null;
      await this.d.assets.detach(tx, { scheduledMessageId: claimed.id });
      // Tác giả không còn hoạt động thì thông báo cũng vô nghĩa (tài khoản đã đi) — bỏ qua.
      if (reason !== "AUTHOR_INACTIVE") await this.d.notifier.scheduledFailed(tx, { scheduledMessageId: claimed.id, authorId: claimed.authorId, reason });
      return next;
    });
    if (!failed) return { kind: "SKIPPED", reason: "STALE" };
    this.emitUpdated(failed);
    return { kind: "FAILED", scheduled: failed };
  }

  /**
   * Phân loại lỗi của `send()`: lỗi nghiệp vụ (`AppError` < 500) là kết luận — tệp lỗi (`MSG_005`) → `ATTACHMENT_INVALID`, không thấy/không được gửi (404/403) → `NO_PERMISSION`, còn lại
   * (`MSG_001/007/008`, `VAL_001`…) → `UNKNOWN` kèm `failCode`. Lỗi khác (Mongo/Redis/mạng, 5xx) là tạm thời → thử lại.
   */
  private classify(err: unknown): FailureClass {
    if (err instanceof AppError && err.statusCode < 500) {
      if (err.errorCode === ErrorCode.MSG_005) return { retry: false, reason: "ATTACHMENT_INVALID", code: err.errorCode };
      if (err.statusCode === 403 || err.statusCode === 404) return { retry: false, reason: "NO_PERMISSION", code: err.errorCode };
      return { retry: false, reason: "UNKNOWN", code: err.errorCode };
    }
    return { retry: true, reason: "UNKNOWN", code: null };
  }

  private emitUpdated(m: ScheduledMessageEntity): void {
    this.d.emitter.toUsers([m.authorId], SocketEvent.SCHEDULED_MESSAGE_UPDATED, { ...toScheduledUpdatedPayload(m) });
  }
}
