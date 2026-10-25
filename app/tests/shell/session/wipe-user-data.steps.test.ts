import AsyncStorage from '@react-native-async-storage/async-storage';

import { useInAppBannerStore } from '@/core/notifications/in-app-banner.store';
import { usePresenceStore, useTypingStore } from '@/core/socket';
import { useUploadStore } from '@/core/uploads/upload.store';
import { useAnnouncementIntentStore } from '@/features/announcements/store/announcement-intent.store';
import { useTaskDraftStore } from '@/features/boards/store/task-comment-drafts.store';
import { useCallMediaStore } from '@/features/calls/store/call-media.store';
import { useCallStore } from '@/features/calls/store/call.store';
import { useChatExtIntentStore } from '@/features/chat-extensions/store/chat-ext-intent.store';
import { useDocEditorStore } from '@/features/docs/store/doc-editor.store';
import { useBlockedRevealStore } from '@/features/chat/store/blocked-reveal.store';
import { useComposerStore } from '@/features/chat/store/composer.store';
import { useDraftsStore } from '@/features/chat/store/drafts.store';
import { useOutboxStore } from '@/features/chat/store/outbox.store';
import { useVoicePlayerStore } from '@/features/chat/store/voice-player.store';
import { useActiveConversationStore } from '@/features/conversations/store/active-conversation.store';
import { useConversationDraftTargetStore } from '@/features/conversations/store/conversation-draft-target.store';
import { useLiveQuizStore } from '@/features/live-quiz/store/live-quiz.store';
import { RECORDING_CACHE_DIR } from '@/features/meeting-recap/utils/recording-files';
import { useMeetingRoomStore } from '@/features/meeting-room/store/meeting-room.store';
import { usePomodoroStore } from '@/features/pomodoro/store/pomodoro.store';
import { useResourceUploadStore } from '@/features/resources/store/resource-uploads.store';
import { MOCK_PLAYER_STORAGE_KEY } from '@/features/study/store/mock-player.constants';
import { useMockPlayerStore } from '@/features/study/store/mock-player.store';
import { useSetEditorStore } from '@/features/study/store/set-editor.store';
import { useWhiteboardSessionStore } from '@/features/whiteboard/store/whiteboard-session.store';
import { useWhiteboardUiStore } from '@/features/whiteboard/store/whiteboard-ui.store';
import {
  recentSearchKey,
  useWorkspaceSearchStore,
} from '@/features/workspace-search/store/workspace-search.store';
import { useOnboardingStore } from '@/features/workspaces/store/onboarding.store';
import { useSavedMessagesStore } from '@/shared/saved/saved.store';
import { useBlockedUsersStore } from '@/shared/stores/blocked-users.store';
import { useModerationIntentStore } from '@/shared/stores/moderation-intent.store';
import { useToastStore } from '@/shared/ui/feedback/toast-store';
import { useAppLockStore } from '@/shell/app-lock';
import { useModulePickerStore } from '@/shell/navigation/module-picker.store';
import { useModulePinsStore } from '@/shell/navigation/module-pins.store';
import { useModuleUsageStore } from '@/shell/navigation/module-usage.store';
import { usePushPrimerStore } from '@/shell/notifications/push-primer';

import { WIPE_STEPS } from '@/shell/session/wipe-steps';
import { wipeUserData } from '@/shell/session/wipe-user-data';
import type { WipeStepId } from '@/shell/session/user-scoped-stores.constants';

/**
 * Từng bước dọn phải THẬT SỰ làm sạch store của nó. `Record<WipeStepId, …>` ép: thêm mã bước mới
 * mà không viết hàng ở đây là `tsc` đỏ — khoá "store mới quên dọn thì test đỏ" ở tầng hành vi
 * (tầng quét cây thư mục nằm ở `user-scoped-stores.manifest.test.ts`).
 */

jest.useFakeTimers();

/**
 * Hệ tệp ảo cho bước `meetingRecap`: bản ghi họp đã tải về là TỆP trong cache, không phải store. `deleteAsync(dir)` xoá mọi tệp dưới `dir`,
 * nên nếu bước dọn quên gọi (hoặc xoá nhầm đường dẫn) thì `isClean` vẫn đỏ. Tên bắt đầu bằng `mock` để `jest.mock` (được hoist) dùng được.
 */
const mockDownloadedFiles = new Set<string>();
jest.mock('expo-file-system/legacy', () => ({
  ...jest.requireActual('expo-file-system/legacy'),
  cacheDirectory: 'file:///cache/',
  deleteAsync: jest.fn(async (uri: string) => {
    for (const file of [...mockDownloadedFiles]) if (file.startsWith(uri)) mockDownloadedFiles.delete(file);
  }),
}));

const TASK_DRAFT = { picks: [], text: 'nháp' };
const SEARCH_KEY = recentSearchKey('u1', 'w1');
const never = <T>(value: unknown) => value as T;

const ROWS: Record<WipeStepId, { isClean: () => boolean | Promise<boolean>; seed: () => void }> = {
  announcements: {
    // Đích của tấm "Yêu cầu"/hộp thoại "Huỷ" là tin của người trước — không được nằm lại cho người sau.
    seed: () =>
      useAnnouncementIntentStore.getState().requestConfirm({ channelId: 'c1', messageId: 'm1' }),
    isClean: () => useAnnouncementIntentStore.getState().intent === null,
  },
  appLock: {
    seed: () => useAppLockStore.getState().lock(),
    isClean: () => !useAppLockStore.getState().locked,
  },
  boards: {
    seed: () => useTaskDraftStore.getState().setDraft('u:t', TASK_DRAFT),
    isClean: () => Object.keys(useTaskDraftStore.getState().drafts).length === 0,
  },
  calls: {
    seed: () => {
      useCallStore.setState({ callId: 'c1', minimized: true });
      useCallMediaStore.getState().patch({ micOn: true });
    },
    isClean: () => useCallStore.getState().callId === null && !useCallMediaStore.getState().micOn,
  },
  chat: {
    seed: () => {
      useOutboxStore.getState().add(
        's',
        never({
          clientMessageId: 'm1',
          status: 'FAILED',
          createdAtLocal: new Date().toISOString(),
        }),
      );
      useDraftsStore.getState().setDraft('s', { text: 'nháp' });
      useComposerStore.getState().setTarget('s', { messageId: 'm', type: 'reply' });
      useBlockedRevealStore.getState().reveal('m');
      useVoicePlayerStore.getState().setPlaying('asset-1');
    },
    isClean: () =>
      Object.keys(useOutboxStore.getState().byScope).length === 0 &&
      Object.keys(useDraftsStore.getState().byScope).length === 0 &&
      Object.keys(useComposerStore.getState().byScope).length === 0 &&
      useBlockedRevealStore.getState().ids.size === 0 &&
      useVoicePlayerStore.getState().playingAssetId === null,
  },
  chatExtensions: {
    // Nháp tin đang soạn (hẹn giờ) + tin đích của "Nhắc lại"/"Tạo task" là của người trước — không được nằm lại cho người sau.
    seed: () => useChatExtIntentStore.getState().open('s', { kind: 'remind', messageId: 'm1' }),
    isClean: () =>
      useChatExtIntentStore.getState().intent === null && !useChatExtIntentStore.getState().visible,
  },
  docs: {
    // Người cùng soạn + con trỏ + lỗi của phiên soạn thảo trước là dữ liệu của tài liệu người trước — không được nằm lại cho người sau.
    seed: () =>
      useDocEditorStore.getState().patch({
        failure: { code: 'LOAD_TIMEOUT', fatal: true },
        ready: true,
        tokenProblem: true,
      }),
    isClean: () => {
      const state = useDocEditorStore.getState();
      return state.failure === null && !state.ready && !state.tokenProblem && state.users.length === 0;
    },
  },
  conversations: {
    seed: () => {
      useActiveConversationStore.getState().setActive('c1');
      useConversationDraftTargetStore.getState().setTarget('k', 'c1');
    },
    isClean: () =>
      useActiveConversationStore.getState().id === null &&
      Object.keys(useConversationDraftTargetStore.getState().byDraftKey).length === 0,
  },
  feedback: {
    seed: () => useToastStore.getState().show('info', 'x'),
    isClean: () => useToastStore.getState().toasts.length === 0,
  },
  liveQuiz: {
    seed: () => useLiveQuizStore.getState().saveAnswer('s', 1, { acked: true, choice: 1 }),
    isClean: () => useLiveQuizStore.getState().sessionId === null,
  },
  meetingRecap: {
    // Video họp đã tải về máy (chủ trì) là dữ liệu riêng tư — không được nằm lại cho người đăng nhập kế tiếp.
    seed: () => {
      mockDownloadedFiles.add(`${RECORDING_CACHE_DIR}rec-1.mp4`);
      mockDownloadedFiles.add(`${RECORDING_CACHE_DIR}rec-2.mp4`);
    },
    isClean: () => mockDownloadedFiles.size === 0,
  },
  meetingRoom: {
    // Vé LiveKit + người tham gia của phòng họp người trước không được nằm lại cho người sau.
    seed: () => useMeetingRoomStore.getState().patch({ callId: 'c1', chatUnread: 3 }),
    isClean: () =>
      useMeetingRoomStore.getState().callId === null &&
      useMeetingRoomStore.getState().chatUnread === 0,
  },
  moderation: {
    seed: () => {
      useBlockedUsersStore.getState().add('u9');
      useModerationIntentStore.setState({ report: never({ targetId: 'x' }) });
    },
    isClean: () =>
      useBlockedUsersStore.getState().ids.size === 0 &&
      useModerationIntentStore.getState().report === null,
  },
  navigation: {
    // Tấm chọn phân hệ + ghim + lượt mở của người trước (Trang chủ) — người sau không được thừa hưởng.
    seed: () => {
      useModulePickerStore.getState().open();
      useModulePinsStore.setState({ hydrated: true, ownerId: 'u1', pinned: ['study'] });
      useModuleUsageStore.setState({
        hydrated: true,
        ownerId: 'u1',
        ranking: { study: { count: 5, lastAt: 1 } },
        usage: { study: { count: 5, lastAt: 1 } },
      });
    },
    isClean: () =>
      !useModulePickerStore.getState().visible &&
      useModulePinsStore.getState().pinned.length === 0 &&
      !useModulePinsStore.getState().hydrated &&
      Object.keys(useModuleUsageStore.getState().usage).length === 0 &&
      Object.keys(useModuleUsageStore.getState().ranking).length === 0,
  },
  notifications: {
    seed: () =>
      useInAppBannerStore.getState().show(never({ body: null, id: 'b', payload: {}, title: 't' })),
    isClean: () => useInAppBannerStore.getState().banner === null,
  },
  onboarding: {
    seed: () => useOnboardingStore.getState().dismiss('onboarding:u1:w1'),
    isClean: async () =>
      Object.keys(useOnboardingStore.getState().records).length === 0 &&
      (await AsyncStorage.getItem('onboarding:u1:w1')) === null,
  },
  pomodoro: {
    // Phòng học của người trước (callId/người tham gia), nháp mục tiêu và phiên vừa kết thúc không được nằm lại cho người sau.
    seed: () => {
      usePomodoroStore.getState().patchRoom({ callId: 'c1', channelId: 'ch1', micOn: true });
      usePomodoroStore.getState().setGoalDraft('s1', 'nháp');
      usePomodoroStore.getState().setEnded({ channelId: 'ch1', sessionId: 's1' });
    },
    isClean: () =>
      usePomodoroStore.getState().room.callId === null &&
      !usePomodoroStore.getState().room.micOn &&
      Object.keys(usePomodoroStore.getState().goalDraft).length === 0 &&
      usePomodoroStore.getState().ended === null,
  },
  primer: {
    seed: () => usePushPrimerStore.getState().show(),
    isClean: () => !usePushPrimerStore.getState().visible,
  },
  resources: {
    seed: () =>
      useResourceUploadStore.getState().setTarget('l1', {
        folderId: null,
        idempotencyKey: 'k',
        phase: 'awaiting',
        workspaceId: 'w',
      }),
    isClean: () => Object.keys(useResourceUploadStore.getState().targets).length === 0,
  },
  saved: {
    seed: () => useSavedMessagesStore.getState().mark('m1', true),
    isClean: () => Object.keys(useSavedMessagesStore.getState().ids).length === 0,
  },
  socket: {
    seed: () => {
      usePresenceStore.getState().set('u1', { state: 'ONLINE', updatedAt: 1 });
      useTypingStore.getState().add('s', 'u1', 10);
    },
    isClean: () =>
      Object.keys(usePresenceStore.getState().byUserId).length === 0 &&
      Object.keys(useTypingStore.getState().byScope).length === 0,
  },
  study: {
    seed: () => {
      useSetEditorStore.setState({ drafts: { s1: never({}) } });
      useMockPlayerStore.getState().saveAnswer('att-1', never({ itemId: 'i1' }));
    },
    // Đáp án thi dở nằm cả trên ĐĨA: phải xoá khoá persist, không chỉ bộ nhớ.
    isClean: async () =>
      Object.keys(useSetEditorStore.getState().drafts).length === 0 &&
      Object.keys(useMockPlayerStore.getState().attempts).length === 0 &&
      (await AsyncStorage.getItem(MOCK_PLAYER_STORAGE_KEY)) === null,
  },
  uploads: {
    seed: () =>
      useUploadStore.setState({
        items: { a: never({ localId: 'a', scope: 'MESSAGE', status: 'queued' }) },
      }),
    isClean: () => Object.keys(useUploadStore.getState().items).length === 0,
  },
  whiteboard: {
    // Công cụ/vùng chọn của bảng người trước + tên người đang mở cùng (awareness) không được nằm lại cho người sau.
    seed: () => {
      useWhiteboardUiStore.getState().setSelection(['el1']);
      useWhiteboardSessionStore
        .getState()
        .setPeers([{ clientId: 2, color: null, id: 'u2', name: 'Lan', pointer: null, selection: [] }], 'u1');
    },
    isClean: () =>
      useWhiteboardUiStore.getState().selection.length === 0 &&
      useWhiteboardSessionStore.getState().peers.length === 0 &&
      useWhiteboardSessionStore.getState().users.length === 0,
  },
  workspaceSearch: {
    seed: () => useWorkspaceSearchStore.getState().add(SEARCH_KEY, 'bảng lương'),
    // Từ khoá tìm nằm cả trên ĐĨA: phải xoá khoá `recent-search:`, không chỉ bộ nhớ.
    isClean: async () =>
      Object.keys(useWorkspaceSearchStore.getState().recents).length === 0 &&
      (await AsyncStorage.getItem(SEARCH_KEY)) === null,
  },
};

describe.each(Object.keys(ROWS) as WipeStepId[])('bước %s', (id) => {
  it('làm sạch store của nó khi wipeUserData()', async () => {
    ROWS[id].seed();
    expect(await ROWS[id].isClean()).toBe(false); // seed phải THẬT SỰ làm bẩn — tránh test xanh giả

    await wipeUserData();

    expect(await ROWS[id].isClean()).toBe(true);
  });
});

it('có đúng một hàng cho MỖI bước trong WIPE_STEPS', () => {
  expect(Object.keys(ROWS).sort()).toEqual(Object.keys(WIPE_STEPS).sort());
});
