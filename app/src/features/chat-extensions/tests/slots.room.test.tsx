import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { scopeKeyOf } from '@/core/socket';
import {
  ChatRoomHostSlot,
  ComposerTopSlot,
  MessageBubbleFooterSlot,
  type ComposerDraftSnapshot,
} from '@/shared/message-extensions';

import { scheduledMessageService } from '../api/scheduled-message.service';
import { useChatExtIntentStore } from '../store/chat-ext-intent.store';
import { cursorPage, makePollMessage, makeScheduled, renderWithProviders, SCOPE } from './fixtures';
import '../register';

/**
 * Nối `chat-extensions` vào các khe của `chat` (DU-05): cờ phụ TẮT → mục menu/banner/chip KHÔNG xuất hiện; BẬT → có, và bấm chỉ GHI ý định vào store (host dựng tấm). Các khe là chính
 * thứ `chat` vẽ (`@/shared/message-extensions`), nên test đi qua đúng cửa đó thay vì import component.
 */
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('@/core/socket', () => ({ ...jest.requireActual('@/core/socket'), useConnectionState: () => 'connected' }));
const mockFlags: Record<string, boolean> = {};
jest.mock('@/shell/capabilities', () => ({
  useCapabilities: () => ({ data: undefined }),
  useFeature: (flag: string) => mockFlags[flag],
}));
jest.mock('../api/scheduled-message.service', () => ({ scheduledMessageService: { listMine: jest.fn() } }));

const listMine = jest.mocked(scheduledMessageService.listMine);
const SCOPE_KEY = scopeKeyOf('CHANNEL', 'ch-1', undefined);
const setFlags = (on: boolean) => {
  for (const flag of ['polls', 'scheduledMessages', 'messageReminders', 'messageToTask']) mockFlags[flag] = on;
};
const draft = (overrides: Partial<ComposerDraftSnapshot> = {}): ComposerDraftSnapshot => ({
  attachmentAssetIds: [],
  canSubmit: true,
  consume: jest.fn(),
  content: 'Xin chào',
  mentions: [],
  ...overrides,
});
const intent = () => useChatExtIntentStore.getState().intent;
/** Ghi/đóng ý định NGOÀI sự kiện chạm (host đang nghe store) — bọc `act` để React cập nhật trong nhịp. */
const openIntent = (key: string, next: Parameters<ReturnType<typeof useChatExtIntentStore.getState>['open']>[1]) =>
  act(async () => useChatExtIntentStore.getState().open(key, next));
const closeIntent = () => act(async () => useChatExtIntentStore.getState().close());

beforeEach(() => {
  jest.clearAllMocks();
  setFlags(true);
  useChatExtIntentStore.setState({ intent: null, session: 0, visible: false });
  listMine.mockResolvedValue(cursorPage([makeScheduled(), makeScheduled({ id: 's-2' })]));
});

describe('khe trên ô soạn — banner "N tin đã hẹn"', () => {
  it('có tin đang chờ → banner đếm; chạm mở "Tin đã hẹn" lọc theo phòng', async () => {
    await renderWithProviders(<ComposerTopSlot scope={SCOPE} />);

    await fireEvent.press(await screen.findByText('2 tin đã hẹn trong cuộc trò chuyện này'));

    expect(listMine).toHaveBeenCalledWith(expect.objectContaining({ scopeId: 'ch-1', scopeType: 'CHANNEL', status: 'PENDING' }));
    expect(router.push).toHaveBeenCalledWith({ params: { scopeId: 'ch-1', scopeType: 'CHANNEL' }, pathname: '/me/scheduled-messages' });
  });

  it('0 tin → ẩn; cờ scheduledMessages TẮT → ẩn và KHÔNG gọi API', async () => {
    listMine.mockResolvedValue(cursorPage([]));
    await renderWithProviders(<ComposerTopSlot scope={SCOPE} />);
    await waitFor(() => expect(listMine).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/tin đã hẹn/)).toBeNull();

    jest.clearAllMocks();
    mockFlags.scheduledMessages = false;
    await renderWithProviders(<ComposerTopSlot scope={SCOPE} />);
    expect(listMine).not.toHaveBeenCalled();
  });
});

describe('khe chân bong bóng — chip "Đã tạo task"', () => {
  const ref = (refId: string) => ({ createdAt: '2026-09-27T00:00:00.000Z', kind: 'TASK' as const, refId });
  const footer = (refs: ReturnType<typeof ref>[]) =>
    renderWithProviders(<MessageBubbleFooterSlot isOwn={false} message={makePollMessage({ kind: 'USER', poll: undefined, sourceRefs: refs })} scope={SCOPE} />);

  it('1 thẻ → "Đã tạo task" (nhãn trợ năng đọc rõ nguồn)', async () => {
    await footer([ref('t-1')]);
    expect(screen.getByLabelText('Đã tạo task từ tin này')).toBeOnTheScreen();
  });

  it('2 thẻ → "Đã tạo 2 task"', async () => {
    await footer([ref('t-1'), ref('t-2')]);
    expect(screen.getByText('Đã tạo 2 task')).toBeOnTheScreen();
  });

  it('DU-05: cờ messageToTask tắt → ẩn chip', async () => {
    mockFlags.messageToTask = false;
    await footer([ref('t-1')]);
    expect(screen.queryByText(/Đã tạo/)).toBeNull();
  });
});

describe('khe host phòng chat — dựng tấm theo ý định', () => {
  it('ý định của phòng NÀY mới dựng tấm; ý định của phòng khác thì không', async () => {
    await openIntent(scopeKeyOf('CHANNEL', 'ch-KHAC', undefined), { kind: 'remind', messageId: 'm-1' });
    const mine = await renderWithProviders(<ChatRoomHostSlot scope={SCOPE} />);
    expect(screen.queryByText('Nhắc lại tin này')).toBeNull();
    await act(async () => mine.unmount()); // gọi như PHƯƠNG THỨC (`this`), và chờ xong trước khi dựng phòng kế

    await renderWithProviders(<ChatRoomHostSlot scope={{ ...SCOPE, scopeId: 'ch-KHAC' }} />);
    expect(screen.getByText('Nhắc lại tin này')).toBeOnTheScreen();
  });

  it('mỗi loại ý định dựng đúng tấm: poll · task · schedule', async () => {
    await renderWithProviders(<ChatRoomHostSlot scope={SCOPE} />);
    for (const [next, title] of [
      [{ kind: 'poll' as const }, 'Tạo khảo sát'],
      [{ content: 'Việc', kind: 'task' as const, messageId: 'm-1', workspaceId: 'ws-1' }, 'Tạo công việc từ tin nhắn'],
      [{ draft: draft(), kind: 'schedule' as const }, 'Hẹn giờ gửi'],
    ] as const) {
      await openIntent(SCOPE_KEY, next);
      expect(await screen.findByText(title)).toBeOnTheScreen();
      await closeIntent();
    }
  });

  it('mọi cờ TẮT → host không dựng gì (không tấm, không nghe socket)', async () => {
    setFlags(false);
    await openIntent(SCOPE_KEY, { kind: 'poll' });
    await renderWithProviders(<ChatRoomHostSlot scope={SCOPE} />);
    expect(screen.queryByText('Tạo khảo sát')).toBeNull();
  });

  it('rời phòng (unmount) khi ý định còn treo → QUÊN hẳn (không giữ nháp/tin đích)', async () => {
    const room = await renderWithProviders(<ChatRoomHostSlot scope={SCOPE} />);
    await openIntent(SCOPE_KEY, { kind: 'schedule', draft: draft() });

    await act(async () => room.unmount());

    expect(intent()).toBeNull();
  });
});
