/**
 * SỔ KHOÁ của dữ liệu người dùng nằm trong bộ nhớ/đĩa của app — nguồn cho test
 * `user-scoped-stores.manifest.test.ts`.
 *
 * ── Vì sao có sổ này ─────────────────────────────────────────────────────────
 * Đăng xuất (hay phiên chết) mà bỏ sót MỘT store là người dùng kế tiếp trên cùng máy thấy nháp
 * tin nhắn, đáp án thi dở, danh sách chặn… của người trước. Lỗi này không bao giờ đỏ ở đâu: mỗi
 * store mới tự nhiên "quên" đăng ký dọn. Test quét cây `src/` tìm mọi file dùng `zustand` / lưu
 * bền rồi đối chiếu với sổ này — thêm store mới mà không khai ở đây là ĐỎ, buộc người viết quyết
 * định: dọn khi rời phiên (thêm vào `USER_SCOPED_RESETS` + bảng dưới) hay ghi lý do nó KHÔNG phải
 * dữ liệu người dùng.
 *
 * Đường dọn: `wipeUserData()` (`wipe-user-data.ts`), gọi từ `purgeSession()` qua
 * `onSessionEnded` — tức là CẢ bốn đường phiên chết — và từ `useLogout`/`completeSignIn`.
 */

/** Mã từng bước dọn. Test hành vi phải có một dòng cho MỖI mã (`wipe-user-data.test.ts`). */
export type WipeStepId =
  | 'announcements'
  | 'appLock'
  | 'boards'
  | 'calls'
  | 'chat'
  | 'chatExtensions'
  | 'conversations'
  | 'docs'
  | 'feedback'
  | 'liveQuiz'
  | 'meetingRecap'
  | 'meetingRoom'
  | 'moderation'
  | 'navigation'
  | 'notifications'
  | 'onboarding'
  | 'pomodoro'
  | 'primer'
  | 'resources'
  | 'saved'
  | 'socket'
  | 'study'
  | 'uploads'
  | 'whiteboard'
  | 'workspaceSearch';

/** Bước dọn → các file store nó bao phủ (đường dẫn từ gốc package `app/`). */
export const WIPE_COVERAGE: Record<WipeStepId, readonly string[]> = {
  // Ý định mở tấm "Yêu cầu xác nhận"/hộp thoại "Huỷ yêu cầu" (đích là tin của người trước) — p5-04.
  announcements: ['src/features/announcements/store/announcement-intent.store.ts'],
  appLock: ['src/shell/app-lock/app-lock.store.ts'],
  boards: ['src/features/boards/store/task-comment-drafts.store.ts'],
  calls: [
    'src/features/calls/store/call-media.store.ts',
    'src/features/calls/store/call.store.ts',
    // Dọn trong `teardownCallSession()` (`resetCallStores` gọi) — phòng thoại của người trước.
    'src/features/calls/voice-room/store/voice-room.store.ts',
  ],
  chat: [
    'src/features/chat/store/blocked-reveal.store.ts',
    'src/features/chat/store/composer.store.ts',
    'src/features/chat/store/drafts.store.ts',
    'src/features/chat/store/outbox.store.ts',
    'src/features/chat/store/voice-player.store.ts',
  ],
  // Ý định mở tấm Khảo sát/Hẹn giờ/Nhắc lại/Tạo task (giữ nháp tin đang soạn + tin đích) — p7-04.
  chatExtensions: ['src/features/chat-extensions/store/chat-ext-intent.store.ts'],
  conversations: [
    'src/features/conversations/store/active-conversation.store.ts',
    'src/features/conversations/store/conversation-draft-target.store.ts',
  ],
  // Trạng thái phiên soạn thảo cộng tác (danh sách người cùng soạn, con trỏ, lỗi) — dữ liệu của tài liệu người trước, không nằm lại — p6-01.
  docs: ['src/features/docs/store/doc-editor.store.ts'],
  feedback: ['src/shared/ui/feedback/toast-store.ts'],
  liveQuiz: ['src/features/live-quiz/store/live-quiz.store.ts'],
  // Bản ghi cuộc họp ĐÃ TẢI VỀ (p2-06): tệp trong `cacheDirectory/recordings/`, không phải store — nên không có file nào để khai ở đây
  // (test quét chỉ đối chiếu store zustand). Vẫn phải dọn: video họp riêng tư không được nằm lại máy cho người đăng nhập kế tiếp.
  meetingRecap: [],
  // Phiên phòng họp: vé LiveKit (token), danh sách người tham gia, sảnh chờ — của người vừa rời.
  meetingRoom: ['src/features/meeting-room/store/meeting-room.store.ts'],
  moderation: [
    'src/shared/stores/blocked-users.store.ts',
    'src/shared/stores/moderation-intent.store.ts',
  ],
  // Ghim + lượt mở phân hệ của Trang chủ (theo NGƯỜI DÙNG: đĩa `u:<userId>:home.*` do `removeAllForUser` xoá, bản trong bộ nhớ do bước này).
  navigation: [
    'src/shell/navigation/module-picker.store.ts',
    'src/shell/navigation/module-pins.store.ts',
    'src/shell/navigation/module-usage.store.ts',
  ],
  notifications: ['src/core/notifications/in-app-banner.store.ts'],
  onboarding: ['src/features/workspaces/store/onboarding.store.ts'],
  // Phòng học Pomodoro (p5-02): kết nối media của phòng người trước + nháp mục tiêu + phiên vừa kết thúc — phải ngắt media, không chỉ xoá store.
  pomodoro: ['src/features/pomodoro/store/pomodoro.store.ts'],
  primer: ['src/shell/notifications/push-primer.ts'],
  resources: ['src/features/resources/store/resource-uploads.store.ts'],
  saved: ['src/shared/saved/saved.store.ts'],
  socket: ['src/core/socket/presence/presence.store.ts', 'src/core/socket/typing/typing.store.ts'],
  study: [
    'src/features/study/store/mock-player.store.ts',
    'src/features/study/store/set-editor.store.ts',
  ],
  uploads: ['src/core/uploads/upload.store.ts'],
  // Bảng trắng (p6-02): công cụ/vùng chọn/tấm soạn chữ + trạng thái phiên collab (lỗi, người khác đang mở — tên/con trỏ). Tuỳ chọn cá nhân trên đĩa (`u:<userId>:wb.*`) do `removeAllForUser` xoá.
  whiteboard: [
    'src/features/whiteboard/store/whiteboard-session.store.ts',
    'src/features/whiteboard/store/whiteboard-ui.store.ts',
  ],
  // Từ khoá tìm gần đây: bộ nhớ + đĩa (`recent-search:{userId}:{wsId}`).
  workspaceSearch: ['src/features/workspace-search/store/workspace-search.store.ts'],
};

/**
 * Store KHÔNG chứa dữ liệu của một người dùng cụ thể (hoặc được dọn ở chỗ khác) — mỗi mục PHẢI
 * có lý do. ⛔ Đừng thêm vào đây chỉ để test xanh: nếu store giữ bất cứ thứ gì do người dùng
 * sinh ra hay lấy từ máy chủ theo tài khoản thì nó thuộc `WIPE_COVERAGE`.
 */
export const NOT_USER_DATA_STORES: Readonly<Record<string, string>> = {
  'src/shell/store/slices/auth/auth.store.ts':
    'Phiên: `purgeSession()` gọi `clearAuth()` (xoá cả `user` đã persist) — không dọn ở `wipeUserData`.',
  'src/shell/store/slices/biometric/biometric.store.ts':
    'Gắn kết sinh trắc học của MÁY: đăng xuất thường GIỮ (p0-13 §2/§5) để lần sau vào bằng một lần quét. ' +
    'Gỡ khi tắt, đổi tài khoản (`reconcileBiometricBinding`), AUTH_014/015 hoặc hết hạn.',
  'src/shell/store/slices/clock/clock.store.ts': 'Độ lệch đồng hồ máy ↔ máy chủ — số đo của máy.',
  'src/shell/store/slices/theme/theme.store.ts': 'Tuỳ chọn sáng/tối của máy.',
};

/**
 * Nơi lưu bền KHÔNG qua zustand (`readJson`/`writeJson`/`AsyncStorage`/`writeSecure`…), theo
 * cách ứng xử khi rời phiên. Test quét cây `src/` tìm mọi file gọi các hàm ghi bền.
 */
export const PERSISTENCE_POLICY: Readonly<Record<string, string>> = {
  // ── Xoá sạch lúc rời phiên (`wipeUserData`) ────────────────────────────────
  'src/features/study/store/mock-player.store.ts':
    'wiped: `resetStudyStores` → `persist.clearStorage()`.',
  'src/features/workspaces/store/onboarding.store.ts':
    'wiped: xoá mọi khoá `onboarding:` theo tiền tố.',
  'src/features/workspace-search/store/workspace-search.store.ts':
    'wiped: `resetWorkspaceSearchStore` xoá mọi khoá `recent-search:` theo tiền tố (khoá còn theo userId).',
  // ── Khoá theo userId: người khác đăng nhập không bao giờ đọc được ─────────────
  'src/features/boards/hooks/useBoardFilter.ts':
    'user-keyed: `boardFilterStorageKey(userId, boardId)`.',
  'src/features/boards/hooks/useGanttBoard.ts':
    'user-keyed: `ganttRangeStorageKey(userId, boardId)`.',
  'src/features/meetings/hooks/useCalendarFilters.ts': 'user-keyed: khoá theo userId.',
  'src/features/resources/hooks/useExplorerPrefs.ts': 'user-keyed: `prefsStorageKey(userId)`.',
  'src/features/o2o/utils/pin-vault.ts':
    'user-keyed (kho khoá): `o2o.pin.<userId>.<orderId>` — PIN nhận hàng; xoá khi đơn kết thúc (`usePrintOrderSocket`, `usePinVault`, huỷ đơn).',
  'src/shell/notifications/push-primer.ts':
    'user-keyed: `push-primer.v1.<userId>`; `usePushSessionCleanup` xoá khi rời phiên.',
  // ── Cấp thiết bị / hệ thống, không phải dữ liệu người dùng ───────────────────
  'src/core/api/session.ts': 'Refresh token (kho khoá): `purgeSession()` xoá.',
  'src/core/device/device-id.ts': 'deviceId của MÁY — định danh thiết bị, giữ qua các phiên.',
  'src/core/auth/biometric/biometric-vault.ts':
    'Bí mật sinh trắc học của máy — xem `biometric.store`.',
  'src/shell/capabilities/use-capabilities.ts':
    'Cache cờ phân hệ của HỆ THỐNG (không theo người dùng).',
  'src/shell/store/slices/auth/auth.store.ts': 'Persist `user`: `clearAuth()` xoá.',
  'src/shell/store/slices/biometric/biometric.store.ts':
    'Persist gắn kết sinh trắc học — xem trên.',
  'src/shell/store/slices/theme/theme.store.ts': 'Persist tuỳ chọn giao diện của máy.',
  // ── Ý định TRƯỚC đăng nhập (thuộc về người sắp đăng nhập, không phải người vừa rời) ──
  'src/features/members/store/pending-invite.ts':
    'intent: lời mời chờ sau đăng nhập; `useLogout` xoá, TTL 1 giờ.',
  'src/shell/session/post-login-intent.ts':
    'intent: link `/live`,`/m`,`/c`,`/s`,`/w` chờ sau đăng nhập; `useLogout` xoá, TTL 30 phút.',
};
