import type { PollCloseReason, PollCreateInput, PollEntity, PollOptionEntity } from "../entities/chat-extensions.types";
import type { TxHandle } from "./tx";

export interface PollCountsPatch {
  options: PollOptionEntity[];
  voterCount: number;
}

export interface IPollRepository {
  /** Ghi khảo sát CÙNG transaction với tin (`IMessageSendPort.send({ onCreated })`); `messageId` unique — tạo lần hai cho cùng tin ném lỗi trùng khoá. */
  create(input: PollCreateInput, tx: TxHandle): Promise<PollEntity>;
  findById(id: string, tx?: TxHandle): Promise<PollEntity | null>;
  findByMessageId(messageId: string, tx?: TxHandle): Promise<PollEntity | null>;
  findByMessageIds(messageIds: string[]): Promise<PollEntity[]>;
  /**
   * Ghi đếm phiếu có điều kiện (CAS): chỉ khi `version` khớp VÀ khảo sát còn `OPEN`. `version + 1`. `null` = CAS lệch (người khác vừa bầu/đóng) — người gọi đọc lại rồi thử lại
   * hoặc kết luận "đã đóng".
   */
  updateCounts(id: string, expectedVersion: number, patch: PollCountsPatch, tx: TxHandle): Promise<PollEntity | null>;
  /** Đóng NGUYÊN TỬ (`OPEN → CLOSED`); `null` khi đã đóng/không tồn tại — hai bên đóng cùng lúc chỉ một thắng. `version + 1`. */
  close(id: string, input: { reason: PollCloseReason; closedBy: string | null; at: Date }, tx?: TxHandle): Promise<PollEntity | null>;
  /** Dựng lại đếm (từ `PollVote`) — không CAS trạng thái, dùng cho sweep/sửa lệch. */
  replaceCounts(id: string, patch: PollCountsPatch, tx?: TxHandle): Promise<PollEntity | null>;
  /** Khảo sát còn `OPEN` mà `closesAt ≤ now` (job đóng bị lỡ) — cho cron quét bù. */
  findDueToClose(now: Date, limit: number): Promise<PollEntity[]>;
}
