import { ROOM } from "../../../infrastructure/socket/socket.rooms";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import type { ChatScopeType, PollEntity } from "../entities/chat-extensions.types";
import type { IPollRepository } from "../repositories/poll.repository.interface";
import type { IChatEmitter, IEmitThrottle } from "./chat-extensions-ports";
import { toPollUpdatedPayload } from "./poll-projection";

/** Phòng chứa nội dung tin của phạm vi (`ch:{id}`/`conv:{id}` — cùng `MessageScope.contentRoom`), dựng bằng `ROOM.*` (không tự ghép chuỗi). */
export const contentRoomOf = (scopeType: ChatScopeType, scopeId: string): string => (scopeType === "CHANNEL" ? ROOM.channel(scopeId) : ROOM.conversation(scopeId));

/**
 * Phát `poll:updated` tới phòng của phạm vi. Bầu/đổi/bỏ phiếu đi qua nhịp (`IEmitThrottle`: vé phát ngay, còn lại một job cuối cửa sổ đọc số MỚI NHẤT); đóng khảo sát phát NGAY
 * (sự kiện hiếm, client cần biết chính xác). Không bao giờ ném — sự kiện chỉ là phần realtime, dữ liệu đã commit; client tải lại là có (so `version`).
 */
export class PollPublisher {
  constructor(
    private readonly polls: Pick<IPollRepository, "findById">,
    private readonly emitter: IChatEmitter,
    private readonly throttle: IEmitThrottle
  ) {}

  async changed(poll: PollEntity, opts: { immediate?: boolean } = {}): Promise<void> {
    try {
      if (opts.immediate || (await this.throttle.tryAcquire(poll.id))) {
        this.emit(poll);
        return;
      }
      await this.throttle.scheduleTrailing(poll);
    } catch {
      // Best-effort: `throttle`/`emitter` đã tự log; không để lỗi realtime làm hỏng request đã commit.
    }
  }

  /** Job `poll.emit`: đọc số liệu MỚI NHẤT rồi phát (phát lặp vô hại — client so `version`). Khảo sát đã xoá → bỏ qua. */
  async emitLatest(pollId: string): Promise<boolean> {
    const poll = await this.polls.findById(pollId);
    if (!poll) return false;
    this.emit(poll);
    return true;
  }

  private emit(poll: PollEntity): void {
    this.emitter.toRoom(contentRoomOf(poll.scopeType, poll.scopeId), SocketEvent.POLL_UPDATED, { ...toPollUpdatedPayload(poll) });
  }
}
