import type { MessagePollReader, MessagePollView, MessagePollViewer } from "../../../shared/ports/message-poll-reader.port";
import type { IPollVoteRepository } from "../repositories/poll-vote.repository.interface";
import type { IPollRepository } from "../repositories/poll.repository.interface";
import { toPollView } from "./poll-projection";

/**
 * Bản đọc khảo sát cho `MessageView.poll` (cổng `MessagePollReader`, `shared/ports/message-poll-reader.port.ts`): MỘT truy vấn khảo sát theo lô tin + MỘT truy vấn phiếu của người xem —
 * không N+1. Quyền đọc tin đã do nơi gọi (`messages`) kiểm; ở đây chỉ ghép. Payload phát cả phòng (`userId = null`) không có `myOptionIds`.
 */
export class PollReaderService implements MessagePollReader {
  constructor(
    private readonly polls: Pick<IPollRepository, "findByMessageIds">,
    private readonly votes: Pick<IPollVoteRepository, "findMine">,
    private readonly now: () => Date = () => new Date()
  ) {}

  async pollsOf(viewer: MessagePollViewer, messageIds: readonly string[]): Promise<Map<string, MessagePollView>> {
    if (messageIds.length === 0) return new Map();
    const polls = await this.polls.findByMessageIds([...messageIds]);
    if (polls.length === 0) return new Map();
    const mine = viewer.userId ? await this.votes.findMine(polls.map((p) => p.id), viewer.userId) : new Map<string, string[]>();
    const now = this.now();
    return new Map(polls.map((p) => [p.messageId, toPollView(p, { viewerId: viewer.userId, myOptionIds: mine.get(p.id) ?? [], canModerate: viewer.canModerate, now })]));
  }
}
