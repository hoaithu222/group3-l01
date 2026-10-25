import { useInAppBannerStore } from '@/core/notifications/in-app-banner.store';
import {
  disconnectSocket,
  resetRoomSubscriptions,
  usePresenceStore,
  useTypingStore,
} from '@/core/socket';
import { useAnnouncementIntentStore } from '@/features/announcements/store/announcement-intent.store';
import { useTaskDraftStore } from '@/features/boards/store/task-comment-drafts.store';
import { resetCallStores } from '@/features/calls/hooks/reset-call-stores';
import { resetChatStores } from '@/features/chat/store/reset-chat-stores';
import { useChatExtIntentStore } from '@/features/chat-extensions/store/chat-ext-intent.store';
import { useVoicePlayerStore } from '@/features/chat/store/voice-player.store';
import { resetConversationStores } from '@/features/conversations/store/reset-conversation-stores';
import { useDocEditorStore } from '@/features/docs/store/doc-editor.store';
import { resetLiveQuizStores } from '@/features/live-quiz/store/live-quiz.store';
import { clearRecordingDownloads } from '@/features/meeting-recap/utils/recording-files';
import { resetMeetingRoomStores } from '@/features/meeting-room/hooks/reset-meeting-room-stores';
import { resetPomodoroStores } from '@/features/pomodoro/hooks/reset-pomodoro-stores';
import { resetResourceStores } from '@/features/resources/store/reset-resource-stores';
import { resetStudyStores } from '@/features/study/store/set-editor.store';
import { resetWhiteboardStores } from '@/features/whiteboard/store/reset-whiteboard-stores';
import { resetWorkspaceSearchStore } from '@/features/workspace-search/store/workspace-search.store';
import { resetOnboardingStore } from '@/features/workspaces/store/onboarding.store';
import { resetSavedStore } from '@/shared/saved';
import { resetModerationStores } from '@/shared/stores/reset-moderation-stores';
import { useToastStore } from '@/shared/ui/feedback/toast-store';
import { useAppLockStore } from '@/shell/app-lock';
import { useModulePickerStore } from '@/shell/navigation/module-picker.store';
import { useModulePinsStore } from '@/shell/navigation/module-pins.store';
import { useModuleUsageStore } from '@/shell/navigation/module-usage.store';
import { usePushPrimerStore } from '@/shell/notifications/push-primer';

import { cancelAllUploads } from './cancel-all-uploads';
import type { WipeStepId } from './user-scoped-stores.constants';

/**
 * Từng bước dọn của `wipeUserData()`. `Record<WipeStepId, …>`: thêm mã vào
 * `user-scoped-stores.constants.ts` mà quên viết bước ở đây (hoặc ngược lại) là `tsc` đỏ.
 *
 * Mỗi bước phải IDEMPOTENT — `wipeUserData()` chạy hơn một lần trên đường đăng xuất (đầu
 * `useLogout`, rồi lại từ `purgeSession()`), và nhiều lần trên đường phiên chết dồn dập.
 */
export const WIPE_STEPS: Record<WipeStepId, () => Promise<void> | void> = {
  // ⛔ `socket` ĐỨNG ĐẦU (`wipeUserData` chạy theo thứ tự khai báo): ngắt socket TRƯỚC khi dọn store —
  // một sự kiện server bắn đúng lúc này (vd `permission:revoked` của chính phiên đang đăng xuất) mà
  // chạy vào listener với state đã rỗng thì lỗi, và lượt đăng nhập kế tiếp phải mở kết nối MỚI thay
  // vì tái dùng một socket còn dính "auth" của người cũ.
  socket: () => {
    disconnectSocket();
    // Registry phòng cũ mà không xoá thì lần kết nối kế tiếp cố join lại phòng của người TRƯỚC.
    resetRoomSubscriptions();
    usePresenceStore.getState().reset();
    useTypingStore.getState().reset();
  },
  announcements: () => useAnnouncementIntentStore.getState().clear(),
  appLock: () => useAppLockStore.getState().unlock(),
  boards: () => useTaskDraftStore.setState({ drafts: {} }),
  calls: () => resetCallStores(),
  chat: () => {
    resetChatStores();
    // Tin thoại của người trước không được tiếp tục phát sang phiên sau.
    useVoicePlayerStore.getState().setPlaying(null);
  },
  // p7-04: ý định mở tấm Khảo sát/Hẹn giờ/Nhắc lại/Tạo task — giữ NHÁP tin đang soạn và tin đích của người trước.
  chatExtensions: () => useChatExtIntentStore.getState().reset(),
  docs: () => useDocEditorStore.getState().reset(),
  conversations: () => resetConversationStores(),
  feedback: () => useToastStore.getState().clear(),
  liveQuiz: () => resetLiveQuizStores(),
  // Bản ghi họp đã tải về máy (chủ trì tải để chia sẻ) là tệp trong cache — xoá cả thư mục `recordings/`. Không ném lỗi, idempotent (`idempotent: true`).
  meetingRecap: () => clearRecordingDownloads(),
  // Controller LiveKit giữ kết nối NGOÀI React: phải ngắt media + dọn đếm giờ, không chỉ xoá store (không thì âm thanh/camera chạy tiếp cho người trước).
  meetingRoom: () => resetMeetingRoomStores(),
  moderation: () => resetModerationStores(),
  navigation: () => {
    useModulePickerStore.getState().close();
    // Ghim + lượt mở của người vừa rời phiên (đĩa đã do `removeAllForUser` xoá) — người sau không được thừa hưởng.
    useModulePinsStore.getState().reset();
    useModuleUsageStore.getState().reset();
  },
  notifications: () => useInAppBannerStore.getState().dismiss(),
  onboarding: () => resetOnboardingStore(),
  // Controller LiveKit giữ kết nối NGOÀI React: ngắt media (dừng mic/camera) rồi xoá store — không thì âm thanh chạy tiếp cho người trước.
  pomodoro: () => resetPomodoroStores(),
  primer: () => usePushPrimerStore.getState().hide(),
  resources: () => resetResourceStores(),
  saved: () => resetSavedStore(),
  study: () => resetStudyStores(),
  uploads: () => cancelAllUploads(),
  whiteboard: () => resetWhiteboardStores(),
  workspaceSearch: () => resetWorkspaceSearchStore(),
};
