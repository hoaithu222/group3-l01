import type { CallMediaPort } from './call-media.types';
import { createLiveKitCallMedia } from './livekit-call-media';

/**
 * Điểm DUY NHẤT lấy cổng media. Mặc định là adapter LiveKit — import TĨNH được vì file adapter chỉ import KIỂU của SDK và
 * nạp module native bằng `import()` lúc `connect` (Jest/Expo Go không chạm tới; thiếu module ⇒ `MediaUnavailableError`).
 * Test thay bằng `setCallMediaForTests(new FakeCallMedia())`.
 */

let override: CallMediaPort | null = null;
let real: CallMediaPort | null = null;

export function getCallMedia(): CallMediaPort {
  if (override) return override;
  real ??= createLiveKitCallMedia();
  return real;
}

export function setCallMediaForTests(port: CallMediaPort | null): void {
  override = port;
  real = null;
}
