import { fireEvent, screen } from '@testing-library/react-native';

import { scopeKeyOf } from '@/core/socket';
import {
  ComposerAttachRowsSlot,
  MessageActionRowsSlot,
  renderMessageBody,
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

beforeEach(() => {
  jest.clearAllMocks();
  setFlags(true);
  useChatExtIntentStore.setState({ intent: null, session: 0, visible: false });
  listMine.mockResolvedValue(cursorPage([makeScheduled(), makeScheduled({ id: 's-2' })]));
});

describe('khe thân bong bóng — thẻ khảo sát', () => {
  it('tin POLL có poll + cờ polls bật → thẻ khảo sát tương tác (có lựa chọn)', async () => {
    await renderWithProviders(<>{renderMessageBody({ isOwn: false, message: makePollMessage(), scope: SCOPE })}</>);
    expect(screen.getByRole('radio', { name: /^Phở/ })).toBeOnTheScreen();
  });

  it('cờ polls TẮT → chỉ còn CÂU HỎI như chữ thường (không lựa chọn, không bầu được)', async () => {
    mockFlags.polls = false;
    await renderWithProviders(<>{renderMessageBody({ isOwn: false, message: makePollMessage(), scope: SCOPE })}</>);
    expect(screen.getByText('Ăn gì trưa nay?')).toBeOnTheScreen();
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('tin thường (USER) hoặc POLL thiếu poll → null: chat vẽ thân mặc định', () => {
    expect(renderMessageBody({ isOwn: false, message: makePollMessage({ kind: 'USER', poll: undefined }), scope: SCOPE })).toBeNull();
    expect(renderMessageBody({ isOwn: false, message: makePollMessage({ poll: undefined }), scope: SCOPE })).toBeNull();
  });
});

describe('khe menu tin — Nhắc lại / Tạo task', () => {
  const rows = (message = makePollMessage({ kind: 'USER', poll: undefined }), onDone = jest.fn()) =>
    renderWithProviders(<MessageActionRowsSlot message={message} scope={SCOPE} onDone={onDone} />);

  it('cờ bật: có "Nhắc lại" và "Tạo task"; bấm chỉ đóng menu + ghi ý định (kèm workspaceId cho task)', async () => {
    const onDone = jest.fn();
    await rows(undefined, onDone);

    await fireEvent.press(screen.getByText('Nhắc lại'));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(intent()).toMatchObject({ kind: 'remind', messageId: 'msg-poll', scopeKey: SCOPE_KEY });

    await fireEvent.press(screen.getByText('Tạo task'));
    expect(intent()).toMatchObject({ kind: 'task', messageId: 'msg-poll', workspaceId: 'ws-1' });
  });

  it('DU-05: tắt messageReminders → không có "Nhắc lại"; tắt messageToTask → không có "Tạo task"', async () => {
    mockFlags.messageReminders = false;
    await rows();
    expect(screen.queryByText('Nhắc lại')).toBeNull();
    expect(screen.getByText('Tạo task')).toBeOnTheScreen();
  });

  it('tin khảo sát chỉ có "Nhắc lại" (BE MSG_006 với task/tài liệu — chỉ tin người dùng thường mới chuyển đổi được)', async () => {
    await rows(makePollMessage());
    expect(screen.getByText('Nhắc lại')).toBeOnTheScreen();
    expect(screen.queryByText('Tạo task')).toBeNull();
    expect(screen.queryByText(/tài liệu/)).toBeNull();
  });

  it('tin đã thu hồi → không có dòng nào', async () => {
    await rows(makePollMessage({ deleted: true }));
    expect(screen.queryByText('Nhắc lại')).toBeNull();
  });
});

describe('khe menu "+" — Khảo sát / Hẹn giờ gửi', () => {
  const attach = (d = draft(), onDone = jest.fn()) =>
    renderWithProviders(<ComposerAttachRowsSlot draft={d} scope={SCOPE} onDone={onDone} />);

  it('cờ bật: bấm "Khảo sát" → đóng menu + ý định poll; "Hẹn giờ gửi" mang nguyên bản chụp nháp', async () => {
    const d = draft();
    await attach(d);

    await fireEvent.press(screen.getByText('Khảo sát'));
    expect(intent()).toMatchObject({ kind: 'poll', scopeKey: SCOPE_KEY });
    await fireEvent.press(screen.getByText('Hẹn giờ gửi'));
    expect(intent()).toMatchObject({ draft: d, kind: 'schedule' });
  });

  it('chưa có gì để gửi (canSubmit=false) → "Hẹn giờ gửi" vẫn hiện nhưng KHÓA, kèm lời nhắc soạn trước', async () => {
    await attach(draft({ canSubmit: false }));
    expect(screen.getByText('Soạn nội dung trước khi hẹn giờ gửi')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Hẹn giờ gửi'));

    expect(intent()).toBeNull();
  });

  it('DU-05: tắt polls → không có "Khảo sát"; tắt scheduledMessages → không có "Hẹn giờ gửi"', async () => {
    mockFlags.polls = false;
    mockFlags.scheduledMessages = false;
    await attach();
    expect(screen.queryByText('Khảo sát')).toBeNull();
    expect(screen.queryByText('Hẹn giờ gửi')).toBeNull();
  });
});
