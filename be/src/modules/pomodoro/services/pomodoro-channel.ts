import { NotFoundError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";
import { pomodoroError } from "../pomodoro.errors";
import type { IPomodoroChannelReader, PomodoroChannelInfo } from "./pomodoro.ports";

/** Kênh tồn tại và LÀ kênh POMODORO (`CALL_POMO_001` 400 khi là loại khác). Quyền đọc kênh đã kiểm ở middleware route (404 trung tính). */
export async function requirePomodoroChannel(channels: IPomodoroChannelReader, channelId: string): Promise<PomodoroChannelInfo> {
  const channel = await channels.get(channelId);
  if (!channel) throw new NotFoundError("Không tìm thấy kênh");
  if (channel.type !== "POMODORO") throw pomodoroError(ErrorCode.CALL_POMO_001, 400);
  return channel;
}

/** Kênh/nhóm đã lưu trữ: xem được (chỉ đọc) nhưng không mở phiên/vào phòng (`CALL_018`). */
export function isChannelOpen(channel: Pick<PomodoroChannelInfo, "status" | "workspaceActive">): boolean {
  return channel.status === "ACTIVE" && channel.workspaceActive;
}
