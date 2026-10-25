import { registerJob } from "../../../infrastructure/queue";
import { getCallsContainer } from "../calls.container";
import { CallChannelVideoService } from "../services/call-channel-video.service";

/**
 * `call.channel-video-disabled` (queue `calls`, dòng outbox do `ChannelService.patch` ghi cùng transaction khi `voiceSettings.allowVideo`
 * đổi true → false) — thu quyền camera của phòng thoại đang chạy (p2-03 be.md §5.9). `channels` chỉ biết TÊN job; xử lý ở đây.
 * Idempotent (xem `CallChannelVideoService`).
 */
registerJob("calls", "call.channel-video-disabled", async (job) => {
  const { channelId } = job.data as { channelId?: string };
  if (!channelId) return;
  await new CallChannelVideoService(getCallsContainer().deps).disableVideo(channelId);
});
