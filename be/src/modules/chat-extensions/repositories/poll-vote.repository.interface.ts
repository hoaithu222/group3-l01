import type { DecodedCursor, PollVoteEntity, PollVoterRef } from "../entities/chat-extensions.types";
import type { TxHandle } from "./tx";

export interface IPollVoteRepository {
  find(pollId: string, userId: string, tx?: TxHandle): Promise<PollVoteEntity | null>;
  /** Lựa chọn của MỘT người cho nhiều khảo sát (1 truy vấn): `pollId → optionIds`; khảo sát chưa bầu không có mặt. */
  findMine(pollIds: string[], userId: string): Promise<Map<string, string[]>>;
  /** Một bản ghi/người (`@@unique([pollId, userId])`): tạo mới hoặc THAY toàn bộ `optionIds`. Đua tạo cùng lúc → lỗi trùng khoá (P2002) — người gọi thử lại. */
  upsert(pollId: string, userId: string, optionIds: string[], tx: TxHandle): Promise<PollVoteEntity>;
  delete(pollId: string, userId: string, tx: TxHandle): Promise<boolean>;
  /** Người bầu một lựa chọn, mới cập nhật trước; cursor `(votedAt, voteId)`. CHỈ gọi khi khảo sát không ẩn danh. */
  listVoters(pollId: string, optionId: string, cursor: DecodedCursor | null, limit: number): Promise<PollVoterRef[]>;
  /** Tổng hợp từ nguồn sự thật (`recount`): `counts[optionId]` + số người đã bầu. Chỉ dùng cho quét bù/sửa lệch và test. */
  tally(pollId: string): Promise<{ counts: Map<string, number>; voters: number }>;
  /** Ẩn danh hoá tài khoản: xoá phiếu của người đó (giữ đếm trên `Poll`). Trả số phiếu đã xoá. */
  deleteByUser(userId: string): Promise<number>;
}
