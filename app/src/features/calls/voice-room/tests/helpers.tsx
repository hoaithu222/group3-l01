import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { FakeCallMedia } from '@/core/media/call-media.fake';
import { setCallMediaForTests } from '@/core/media/call-media.registry';
import { useAuthStore } from '@/shell/store/slices/auth';

import type { CallDto, CallParticipantDto } from '../../api/calls.types';
import { useCallMediaStore } from '../../store/call-media.store';
import { callStoreApi } from '../../store/call.store';
import type { VoicePreview, VoicePreviewParticipant } from '../api/voice-room.types';
import { useVoiceRoomStore } from '../store/voice-room.store';

/** Đồ dùng chung cho test phòng thoại kênh. KHÔNG phải test (`testMatch` chỉ nhận `*.test.ts(x)`). */

/** ⚠️ `Screen`/`AppBar`/`BottomSheet` gọi `useSafeAreaInsets()` — ném lỗi nếu thiếu provider. */
const METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      mutations: { gcTime: 0, retry: false },
      queries: { gcTime: Infinity, retry: false, staleTime: 0 },
    },
  });
}

/** ⚠️ `render()` của RNTL 14 là BẤT ĐỒNG BỘ — phải `await`. */
export async function renderWithProviders(ui: ReactElement, queryClient: QueryClient = makeQueryClient()) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={METRICS}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </SafeAreaProvider>
    );
  }
  const result = await render(ui, { wrapper: Wrapper });
  return { ...result, queryClient };
}

/** Phần tử host mà truy vấn RNTL 14 trả về (`TestInstance` của `test-renderer`) — chỉ cần hai trường này. */
interface HostNode {
  parent: HostNode | null;
  props: Record<string, unknown>;
}

/**
 * `className` của các lớp nằm GIỮA `content` và thẻ TẤM của `BottomSheet` (khối mang `minHeight` nội tuyến ở `SheetSurface`) mà
 * THIẾU `flex-1`; `[]` = cả chuỗi giãn đủ, `null` = `content` không nằm trong tấm nào.
 *
 * ⚠️ Jest không chạy Yoga nên không đo được chiều cao — chỉ khoá được HỢP ĐỒNG bố cục (đọc `className` như `HighlightedSnippet.test.tsx`):
 * tấm có `height` cố định nhưng thân KHÔNG cuộn cao theo nội dung, nên mọi lớp ở giữa phải `flex-1`. Đứt một lớp là `ChatRoom` sập về ~0 —
 * ô soạn dạt lên ngay dưới tiêu đề, trạng thái rỗng vẽ đè lên tiêu đề (lỗi đã gặp trên máy thật ở `RoomChatSheet`).
 */
export function sheetLayersWithoutFlex1(content: HostNode): string[] | null {
  const missing: string[] = [];
  for (let node = content.parent; node; node = node.parent) {
    const styles: unknown[] = [node.props.style].flat(Infinity);
    if (styles.some((entry) => typeof entry === 'object' && entry !== null && 'minHeight' in entry)) return missing;
    const className = typeof node.props.className === 'string' ? node.props.className : '';
    if (!className.split(/\s+/).includes('flex-1')) missing.push(className);
  }
  return null;
}

/** Lỗi axios có cấu trúc `{ error: { code, details } }` như BE trả. */
export function apiError(status: number, code: string, details?: unknown) {
  return Object.assign(new Error(`HTTP ${String(status)}`), {
    isAxiosError: true,
    response: { data: { error: { code, details, message: code } }, headers: {}, status },
  });
}

export function makeParticipant(over: Partial<CallParticipantDto> & { userId: string }): CallParticipantDto {
  return {
    avatarUrl: null,
    handRaisedAt: null,
    mutedByHost: false,
    name: `Người ${over.userId}`,
    role: 'MEMBER',
    screenSharing: false,
    state: 'CONNECTED',
    ...over,
  };
}

/** Phòng thoại kênh `ch1` của workspace `ws1`, chủ phòng `host`. */
export function makeRoomCall(over: Partial<CallDto> = {}): CallDto {
  return {
    answeredAt: '2026-09-25T10:00:00.000Z',
    callUuid: '00000000-0000-5000-8000-000000000001',
    durationSec: null,
    endReason: null,
    endedAt: null,
    hostId: 'host',
    id: 'call1',
    initiator: { avatarUrl: null, id: 'host', name: 'Người host' },
    mediaKind: 'AUDIO',
    mode: 'ROOM',
    myActions: { canAnswer: false, canCancel: false, canDecline: false, canEnd: false, canInvite: false, canJoin: false, canLeave: true },
    participants: [makeParticipant({ role: 'HOST', userId: 'host' }), makeParticipant({ userId: 'me' })],
    scope: { avatarUrl: null, kind: 'CHANNEL', title: 'phong-hoc' },
    scopeId: 'ch1',
    scopeType: 'CHANNEL',
    serverNow: '2026-09-25T10:00:30.000Z',
    startedAt: '2026-09-25T10:00:00.000Z',
    status: 'ACTIVE',
    version: 1,
    workspaceId: 'ws1',
    ...over,
  };
}

export const ROOM_TOKEN = { expiresAt: '2026-09-25T10:10:00.000Z', livekitUrl: 'wss://lk', token: 'jwt' };

/** Mình (`me`) vào phòng `ch1` rồi media kết nối (pha `active`); mặc định có chủ phòng `host`, mình, và `lan`. */
export function enterRoom(over: Partial<CallDto> = {}): void {
  callStoreApi.dispatch({ type: 'RESET' });
  callStoreApi.dispatch({ clientCallId: 'c', type: 'START_BEGIN' });
  callStoreApi.dispatch({
    call: makeRoomCall({
      participants: [makeParticipant({ role: 'HOST', userId: 'host' }), makeParticipant({ userId: 'me' }), makeParticipant({ name: 'Lan', userId: 'lan' })],
      ...over,
    }),
    joined: false,
    token: ROOM_TOKEN,
    type: 'START_OK',
  });
  callStoreApi.dispatch({ type: 'MEDIA_CONNECTED' });
}

/** Trạng thái đầu MỌI test màn phòng: đã ở trong phòng, media kết nối, mic bật, không lời nhắc nào. Trả cổng media giả. */
export function setupRoomScreen(): FakeCallMedia {
  const media = new FakeCallMedia();
  setCallMediaForTests(media);
  useAuthStore.setState({ user: { id: 'me' } } as never);
  useVoiceRoomStore.getState().reset();
  useCallMediaStore.getState().reset();
  useCallMediaStore.getState().patch({ connection: 'connected', micOn: true });
  enterRoom();
  return media;
}

export function makePreviewParticipant(over: Partial<VoicePreviewParticipant> & { userId: string }): VoicePreviewParticipant {
  return {
    avatarUrl: null,
    cameraEnabled: true,
    handRaisedAt: null,
    isHost: false,
    micEnabled: true,
    name: `Người ${over.userId}`,
    sharingScreen: false,
    ...over,
  };
}

export function makePreview(over: Partial<VoicePreview> = {}): VoicePreview {
  return {
    call: null,
    channel: { id: 'ch1', name: 'phong-hoc', voiceSettings: { allowVideo: true, maxParticipants: 8 } },
    limits: { maxParticipants: 8, maxScreenShares: 1 },
    myActions: { canJoin: true },
    participants: [],
    seatsLeft: 8,
    serverNow: '2026-09-25T10:00:00.000Z',
    ...over,
  };
}
