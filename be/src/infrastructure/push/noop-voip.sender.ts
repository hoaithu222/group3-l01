import { logger } from "../logger";
import type { ApnsEnvironment, IVoipSender, VoipPayload, VoipSendResult } from "./push.types";

let warned = false;

/**
 * Dùng khi thiếu APNs credentials (`APNS_KEY_ID`/`APNS_TEAM_ID`/`APNS_KEY_P8`
 * hoặc `APNS_KEY_PATH`). Mọi lời gọi trả `ok:false` im lặng — không throw,
 * không chặn nghiệp vụ gọi nó (`call.incoming` vẫn có FCM data-only cho
 * Android). Log cảnh báo đúng một lần lúc sender đầu tiên được dùng.
 */
export class NoopVoipSender implements IVoipSender {
  async send(
    _token: string,
    _environment: ApnsEnvironment,
    _bundleId: string,
    _payload: VoipPayload
  ): Promise<VoipSendResult> {
    if (!warned) {
      warned = true;
      logger.warn("[push] Thiếu APNS_* — VoIP đang chạy NoopVoipSender (không gửi thật)");
    }
    return { ok: false, status: 0, shouldRevoke: false, retriable: false, reason: "NOT_CONFIGURED" };
  }
}
