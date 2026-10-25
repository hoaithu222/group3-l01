import { logger } from "../logger";
import type { IPushSender, PushPayload, PushSendResult } from "./push.types";

let warned = false;

/**
 * Dùng khi thiếu Firebase credentials (`FIREBASE_*`/`FIREBASE_CREDENTIALS_JSON`).
 * Mọi lời gọi thành công im lặng — `successCount: 0`, không throw, không chặn
 * nghiệp vụ gọi nó. Log cảnh báo đúng một lần lúc sender đầu tiên được dùng.
 */
export class NoopPushSender implements IPushSender {
  async sendMulticast(_tokens: string[], _payload: PushPayload): Promise<PushSendResult> {
    if (!warned) {
      warned = true;
      logger.warn("[push] Thiếu FIREBASE_* — push đang chạy NoopPushSender (không gửi thật)");
    }
    return { successCount: 0, invalidTokens: [] };
  }
}
