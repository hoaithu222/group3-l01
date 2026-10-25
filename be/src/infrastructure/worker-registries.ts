/**
 * @file worker-registries.ts
 * @description Boot các REGISTRY mà tiến trình API dựng ở `router.ts` nhưng processor của worker riêng (`PROCESS_ROLE=worker`, KHÔNG import
 * `router.ts`) cũng cần: resolver scope (`permissionService.can/assert/resolve` trong fan-out/push/`revokeScope`), `MessageScope`
 * (fan-out, push, `message.events`), hook thread/mention/đọc/hội thoại, loại thông báo đăng ký lúc import service, audience presence.
 *
 * Trước đây thiếu ⇒ ở topology `api` + `worker` riêng (mặc định production): `fanout.message` thấy audience rỗng, `push.send` coi mọi người nhận
 * là mất quyền, `message.events` bỏ emit realtime, `deliver.recipient` không tìm thấy loại `workspace.admin-change` (p1-07 be.md §16.1).
 * `PROCESS_ROLE=all` KHÔNG gọi hàm này — nó chạy chung tiến trình với `router.ts` nên registry đã có đủ.
 *
 * Thứ tự GIỐNG `router.ts`: `registerChannelModule`/`registerProjectsModule` bọc `children()` của resolver WORKSPACE nên phải chạy SAU
 * `workspaces.routes`; `registerCallsModule` cần resolver CHANNEL/CONVERSATION đã có.
 *
 * ⛔ KHÔNG đăng ký ở đây thứ CHỈ tiến trình API được chạy: executor + subscriber Redis của `live-quiz`/`pomodoro` (lệnh hẹn giờ phải chạy đúng MỘT
 * lần ở nơi có timer + CAS + `fetchSockets`), guard room socket, contributor trang tổng quan, cổng upload `POST /assets`, bản đọc voice của danh sách
 * kênh, quyền tải `CONTRIBUTION_EXPORT`. Test parity `src/tests/worker-registries.parity.test.ts` giữ hai bên khớp: registry mới đăng ký ở API mà
 * job cần ⇒ thêm vào đây; thật sự chỉ của API ⇒ thêm vào `API_ONLY` của test kèm lý do.
 */
export async function registerWorkerRegistries(): Promise<void> {
  // workspaces: resolver WORKSPACE + audience/join-rooms presence + loại thông báo `workspace.admin-change` (đăng ký lúc import service).
  await import("../modules/workspaces/workspaces.routes");
  // channels: resolver CHANNEL (lúc import routes) rồi `registerChannelModule()` = `MessageScope` CHANNEL + `children()` WORKSPACE→CHANNEL.
  await import("../modules/channels/channels.routes");
  (await import("../modules/channels")).registerChannelModule();
  // conversations: resolver CONVERSATION (lúc import routes) rồi `MessageScope` CONVERSATION + `ConversationHooks` + `IReadReceiptPublisher`.
  await import("../modules/conversations/conversations.routes");
  (await import("../modules/conversations")).registerConversationModule();
  // `IThreadHook` / `IMentionValidator` / `IReadStateReader` — `message.outbox-handlers`, fan-out và `ThreadService` gọi qua `core/permission`.
  (await import("../modules/threads")).registerThreadsModule();
  (await import("../modules/mentions")).registerMentionsModule();
  // BOARD (+ `children()` cho `revokeScope`), loại thông báo task/review, chính sách/hiệu ứng chuyển cột, listener thu hồi quyền của review.
  (await import("../modules/projects")).registerProjectsModule();
  (await import("../modules/read-state")).registerReadStateModule();
  // CHAT-EXTENSIONS (p7-04): cổng đọc khảo sát cho `MessageView.poll` (worker cần để `message:created` của tin khảo sát mang `poll`) + loại thông báo `scheduled-message.failed`/`message.reminder`.
  (await import("../modules/chat-extensions")).registerChatExtensionsModule();
  // CALL / MEETING: resolver, loại thông báo, listener thu hồi quyền, quyền đọc tệp biên bản/ghi hình.
  (await import("../modules/calls")).registerCallsModule();
  (await import("../modules/meetings")).registerMeetingsModule();
  // DOCUMENT (p6-01): resolver scope + loại thông báo `document.collaborator-added` + listener thu hồi quyền → đóng kết nối collab. Cổng upload `DOC` và quyền đọc asset `DOCUMENT` CHỈ ở API.
  (await import("../modules/documents")).registerDocumentsModule();
  // WHITEBOARD (p6-02): resolver scope + listener thu hồi quyền → đóng kết nối collab. Cổng upload `WHITEBOARD` và quyền đọc asset `WHITEBOARD` CHỈ ở API.
  (await import("../modules/whiteboards")).registerWhiteboardsModule();
  // RECRUITER (p6-08): resolver scope `COMPANY` + provider quyền theo dữ liệu `company` + loại thông báo `job-offer.*`/`company.*` + đích báo cáo `COMPANY`/`JOB_OFFER`. Quyền đọc asset `COMPANY_LOGO`/`JOB_OFFER` CHỈ ở API.
  (await import("../modules/recruiter")).registerRecruiterModule();
  // BURNOUT (p7-03): loại thông báo `wellbeing.alert` (worker giao thông báo/push cho cảnh báo). Listener nhịp presence `active` (`registerBurnoutPresenceCollector`) CHỈ ở API — worker không nhận `presence:heartbeat`.
  (await import("../modules/burnout")).registerBurnoutModule();
  // AUTH: loại thông báo `auth.new-device` (worker giao push/hộp thư cảnh báo đăng nhập thiết bị lạ).
  (await import("../modules/auth/services/auth-notification-types")).registerAuthNotificationTypes();
}
