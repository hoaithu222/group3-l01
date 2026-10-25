import type { DecodedCursor, MessageReminderEntity, MessageReminderStatus, ReminderCreateInput } from "../entities/chat-extensions.types";
import type { TxHandle } from "./tx";

export interface IMessageReminderRepository {
  create(input: ReminderCreateInput, tx: TxHandle): Promise<MessageReminderEntity>;
  findById(id: string, tx?: TxHandle): Promise<MessageReminderEntity | null>;
  countPending(userId: string, tx?: TxHandle): Promise<number>;
  /** Huỷ khi còn `PENDING` (đúng chủ nhắc) — CAS; `null` khi không khớp (đã phát/đã huỷ/của người khác). */
  cancel(id: string, userId: string, at: Date, tx?: TxHandle): Promise<MessageReminderEntity | null>;
  /**
   * Đến hạn: `PENDING → FIRED` NGUYÊN TỬ (job chạy hai lần chỉ một lần thắng), ghi luôn `unavailable` (tin đã gỡ/mất quyền đọc lúc đến hạn); `null` khi thua. Chạy trong transaction
   * CÙNG với việc ghi thông báo — lỗi ghi thông báo ⇒ rollback cả lượt claim để BullMQ thử lại không mất lời nhắc.
   */
  claimFire(id: string, input: { at: Date; unavailable: boolean }, tx: TxHandle): Promise<MessageReminderEntity | null>;
  /** Đang chờ: sắp nhắc sớm nhất trước; đã nhắc: mới nhất trước. Cursor `(remindAt, id)`. */
  listMine(userId: string, status: Exclude<MessageReminderStatus, "CANCELLED">, cursor: DecodedCursor | null, limit: number): Promise<MessageReminderEntity[]>;
  /** Cho cron quét bù: `PENDING` mà `remindAt < missedBefore` (job hẹn giờ bị lỡ). */
  findMissed(missedBefore: Date, limit: number): Promise<MessageReminderEntity[]>;
  /** Ẩn danh hoá tài khoản: huỷ mọi nhắc `PENDING` của người đó. Trả số nhắc đã huỷ. */
  cancelPendingOfUser(userId: string, at: Date): Promise<number>;
}
