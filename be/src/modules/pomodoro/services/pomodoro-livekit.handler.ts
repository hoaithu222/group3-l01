import { roomNames, type LiveKitHandlerResult, type NormalizedLiveKitEvent } from "../../../infrastructure/media";
import type { IPomodoroRepository } from "../repositories/pomodoro.repository.interface";
import type { PomodoroPresenceService } from "./pomodoro-presence.service";
import type { PomodoroRunner } from "./pomodoro-runner.service";

/**
 * Handler webhook LiveKit của phòng `call_<id>` cho phiên Pomodoro (đăng ký cạnh handler `p2-01.calls` của lõi — registry cho phép nhiều handler cùng loại,
 * chạy tuần tự). Chỉ đụng tới phòng THUỘC một phiên Pomodoro (`PomodoroSession.callId`), phòng thoại thường → `IGNORED`. Không dựa vào thứ tự với handler của
 * `calls`: hiện diện lấy từ chính sự kiện, "phòng rỗng" hỏi lại `listParticipants` (nguồn sự thật). Chạy ở worker nên KHÔNG phát socket — `broadcaster` lo.
 */
export class PomodoroLiveKitHandler {
  constructor(
    private readonly repo: IPomodoroRepository,
    private readonly presence: PomodoroPresenceService,
    private readonly runner: PomodoroRunner
  ) {}

  async handle(event: NormalizedLiveKitEvent): Promise<LiveKitHandlerResult> {
    const { kind, ref: callId } = roomNames.parse(event.roomName ?? "");
    if (kind !== "call") return "IGNORED";
    const identity = event.participant?.identity;

    if (event.type === "participant_joined" && identity) {
      const session = await this.presence.onJoined(callId, identity);
      if (!session) return "IGNORED";
      await this.runner.onOccupied(session.id);
      return "PROCESSED";
    }
    if (event.type === "participant_left" && identity) {
      const session = await this.presence.onLeft(callId, identity);
      if (!session) return "IGNORED";
      await this.runner.onMaybeEmpty(session.id);
      return "PROCESSED";
    }
    if (event.type === "room_finished") {
      const session = await this.repo.findByCallId(callId);
      if (!session || session.phase === "ENDED") return "IGNORED";
      await this.runner.onMaybeEmpty(session.id);
      return "PROCESSED";
    }
    return "IGNORED";
  }
}
