import { logger } from "../../../infrastructure/logger";
import { ROOM, SocketEvent } from "../../../infrastructure/socket";
import { emitToRoom } from "../../../infrastructure/socket/socket.emit";
import type { IPomodoroRepository } from "../repositories/pomodoro.repository.interface";
import type { PomodoroSnapshotBuilder } from "../services/pomodoro-snapshot";
import type { IPomodoroBroadcaster } from "../services/pomodoro.ports";

/** Cổng socket tối thiểu — test thay bằng bản ghi lại. */
export interface PomodoroSocketPort {
  emit(room: string, event: string, payload: object): void;
}

/** `emitToRoom` chạy được ở CẢ API (phát trực tiếp) lẫn worker (cầu nối Redis `socket.bridge` — mọi instance API nhận đúng một lần). */
export const defaultSocketPort: PomodoroSocketPort = {
  emit: (room, event, payload) => emitToRoom(room, event, payload),
};

/**
 * Phát `pomodoro:updated` (S→C, room `ch:{channelId}`) — payload là snapshot CHUNG cả phòng (mục tiêu chỉ hiện khi người đó bật chia sẻ, không
 * `myGoal`/`myActions`), dựng LẠI từ DB ở thời điểm phát (không dùng bản chụp cũ ⇒ luôn mới nhất, `serverNow` đúng lúc phát).
 *
 * Phát từ TIẾN TRÌNH ĐÃ ĐỔI TRẠNG THÁI (CAS thắng ở DB) — job/webhook ở worker cũng phát thẳng qua cầu nối chung của hạ tầng, nên KHÔNG cần cầu
 * riêng "nhờ API phát" (bản tạm trước đó đã gỡ). Phát là best-effort: lỗi (Redis chập chờn, socket chưa khởi tạo lúc khởi động) chỉ ghi log — DB đã
 * là nguồn sự thật và client tự bù bằng refetch/`onRoomResync`/canh quá hạn `phaseEndsAt`.
 */
export class SocketPomodoroBroadcaster implements IPomodoroBroadcaster {
  constructor(
    private readonly repo: IPomodoroRepository,
    private readonly snapshots: PomodoroSnapshotBuilder,
    private readonly socket: PomodoroSocketPort = defaultSocketPort
  ) {}

  async broadcast(sessionId: string): Promise<void> {
    const session = await this.repo.findById(sessionId);
    if (!session) return;
    const payload = await this.snapshots.build(session);
    try {
      this.socket.emit(ROOM.channel(session.channelId), SocketEvent.POMODORO_UPDATED, payload);
    } catch (err) {
      logger.warn("[pomodoro] Phát pomodoro:updated lỗi", { sessionId, error: err instanceof Error ? err.message : String(err) });
    }
  }
}
