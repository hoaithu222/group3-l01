import type {
  ChatScopeType,
  DecodedCursor,
  ScheduledFailReason,
  ScheduledMessageCreateInput,
  ScheduledMessageEntity,
  ScheduledMessagePatch,
  ScheduledMessageStatus,
} from "../entities/chat-extensions.types";
import type { TxHandle } from "./tx";

export interface ScheduledListFilter {
  status: ScheduledMessageStatus;
  scopeType?: ChatScopeType;
  scopeId?: string;
}

/**
 * Mọi thay đổi trạng thái là CAS (`updateMany` có điều kiện trạng thái/`version`) trả `null` khi thua — hai lượt phát/sửa/huỷ đồng thời chỉ MỘT bên thắng (SCHED-02/03).
 * `version + 1` ở mọi ghi làm đổi giờ/nội dung/trạng thái công khai (jobId hẹn giờ gắn `version` nên job cũ tự vô hiệu).
 */
export interface IScheduledMessageRepository {
  create(input: ScheduledMessageCreateInput, tx: TxHandle): Promise<ScheduledMessageEntity>;
  findById(id: string, tx?: TxHandle): Promise<ScheduledMessageEntity | null>;
  countPending(authorId: string, tx?: TxHandle): Promise<number>;
  /** Sửa khi còn `PENDING` (đúng tác giả + đúng `version`). `null` = không khớp (người gọi đọc lại để phân loại 404/`SCHED_003`/`RES_003`). */
  updateIfPending(id: string, authorId: string, expectedVersion: number, patch: ScheduledMessagePatch, tx: TxHandle): Promise<ScheduledMessageEntity | null>;
  /** Huỷ khi còn `PENDING` (đúng tác giả, không cần `version`). */
  cancel(id: string, authorId: string, at: Date, tx: TxHandle): Promise<ScheduledMessageEntity | null>;
  /**
   * Nhận việc phát: `PENDING → SENDING` (hoặc `SENDING` đã kẹt quá `staleBefore` — worker chết giữa chừng) khi `version` khớp; `attempts + 1`. `null` = job trùng/đã bị đổi giờ/huỷ.
   * KHÔNG tăng `version` (jobId theo `version` đã hẹn giờ — đổi `version` là làm mất job của chính lần phát này).
   */
  claimForSend(id: string, expectedVersion: number, staleBefore: Date): Promise<ScheduledMessageEntity | null>;
  /** `SENDING → SENT` (kèm `messageId`), tăng `version`. */
  markSent(id: string, input: { messageId: string; at: Date }, tx: TxHandle): Promise<ScheduledMessageEntity | null>;
  /** `SENDING → FAILED` (kèm lý do), tăng `version`. `scrub` xoá nội dung/tệp/mention (tác giả đã bị khoá/ẩn danh — không giữ dữ liệu của họ). */
  markFailed(id: string, input: { reason: ScheduledFailReason; code: string | null; scrub?: boolean }, tx: TxHandle): Promise<ScheduledMessageEntity | null>;
  /** `SENDING → PENDING` sau lỗi hạ tầng (BullMQ thử lại), KHÔNG đổi `version`. */
  revertToPending(id: string): Promise<ScheduledMessageEntity | null>;
  listMine(authorId: string, filter: ScheduledListFilter, cursor: DecodedCursor | null, limit: number): Promise<ScheduledMessageEntity[]>;
  /** Cho cron quét bù: `PENDING` lỡ giờ > `missedBefore` hoặc `SENDING` kẹt quá `staleBefore`. */
  findStale(missedBefore: Date, staleBefore: Date, limit: number): Promise<ScheduledMessageEntity[]>;
  /** Ẩn danh hoá tài khoản: mọi tin `PENDING` của người đó → `CANCELLED`, xoá nội dung/tệp. Trả các tin đã huỷ (để gỡ liên kết tệp). */
  cancelPendingOfAuthor(authorId: string, at: Date, tx: TxHandle): Promise<ScheduledMessageEntity[]>;
}
