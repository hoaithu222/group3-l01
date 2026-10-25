/**
 * Barrel của module `chat-extensions` (p7-04): khảo sát, tin hẹn giờ, nhắc lại tin, chuyển tin thành thẻ/tài liệu.
 *
 * `registerChatExtensionsModule()` — side-effect boot, gọi ở CẢ API (`router.ts`) lẫn worker (`worker-registries.ts` + đầu `jobs/chat-extensions.jobs.ts`): đăng ký bản đọc khảo sát cho
 * `MessageView.poll` (cổng `shared/ports/message-poll-reader.port`, worker cần để `message:created` của tin khảo sát mang `poll`) và các loại thông báo `scheduled-message.failed`/`message.reminder`.
 * Job/cron của worker nạp ở `register-jobs.ts` (`jobs/chat-extensions.jobs.ts`). Module KHÔNG có scope quyền riêng: quyền đi theo `MessageScope` (kênh/hội thoại) qua `IMessageSendPort`.
 */
import { registerMessagePollReader } from "../../shared/ports/message-poll-reader.port";
import { getChatExtensionsContainer } from "./chat-extensions.container";
import { registerChatExtensionsNotificationTypes } from "./services/chat-extensions-notification-types";

export function registerChatExtensionsModule(): void {
  registerMessagePollReader(getChatExtensionsContainer().pollReader);
  registerChatExtensionsNotificationTypes();
}
