import type { IPollVoteRepository } from "../repositories/poll-vote.repository.interface";
import type { IMessageReminderRepository } from "../repositories/message-reminder.repository.interface";
import type { IScheduledMessageRepository } from "../repositories/scheduled-message.repository.interface";
import type { ITxRunner } from "../repositories/tx";
import type { IScheduledAssetPort } from "./chat-extensions-ports";

export interface UserDataCleanupResult {
  scheduledCancelled: number;
  remindersCancelled: number;
  votesDeleted: number;
}

/**
 * Ẩn danh hoá tài khoản (job `chat-extensions.on-user-anonymized`, `UserAnonymizer` ghi một dòng outbox RIÊNG — p7-04 be.md §7): huỷ mọi tin hẹn giờ `PENDING` (xoá nội dung/tệp, gỡ
 * `AssetLink`) và nhắc `PENDING` của người đó, xoá phiếu bầu của họ (giữ NGUYÊN số đếm trên `Poll` — kết quả cuộc khảo sát không đổi). Idempotent: chạy lại không còn gì để làm.
 */
export class ChatExtensionsUserDataService {
  constructor(
    private readonly scheduled: Pick<IScheduledMessageRepository, "cancelPendingOfAuthor">,
    private readonly reminders: Pick<IMessageReminderRepository, "cancelPendingOfUser">,
    private readonly votes: Pick<IPollVoteRepository, "deleteByUser">,
    private readonly assets: IScheduledAssetPort,
    private readonly tx: ITxRunner,
    private readonly now: () => Date = () => new Date()
  ) {}

  async onUserAnonymized(userId: string): Promise<UserDataCleanupResult> {
    const at = this.now();
    const cancelled = await this.tx.run(async (tx) => {
      const rows = await this.scheduled.cancelPendingOfAuthor(userId, at, tx);
      for (const row of rows) await this.assets.detach(tx, { scheduledMessageId: row.id });
      return rows;
    });
    const [remindersCancelled, votesDeleted] = await Promise.all([this.reminders.cancelPendingOfUser(userId, at), this.votes.deleteByUser(userId)]);
    return { scheduledCancelled: cancelled.length, remindersCancelled, votesDeleted };
  }
}
