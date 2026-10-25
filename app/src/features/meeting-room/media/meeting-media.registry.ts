import { createLiveKitMeetingMedia } from './livekit-meeting-media';
import type { MeetingMediaPort } from './meeting-media.types';

/**
 * Điểm DUY NHẤT lấy cổng media của phòng họp. Mặc định là adapter LiveKit — import TĨNH được vì adapter chỉ import KIỂU của SDK và nạp
 * module native bằng `import()` lúc `connect` (Jest/Expo Go không chạm tới; thiếu module ⇒ `MediaUnavailableError` của `core/media`).
 * Test thay bằng `setMeetingMediaForTests(new FakeMeetingMedia())`.
 */

let override: MeetingMediaPort | null = null;
let real: MeetingMediaPort | null = null;

export function getMeetingMedia(): MeetingMediaPort {
  if (override) return override;
  real ??= createLiveKitMeetingMedia();
  return real;
}

export function setMeetingMediaForTests(port: MeetingMediaPort | null): void {
  override = port;
  real = null;
}
