import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import {
  MessageActionRowsSlot,
  type MessageExtensionMessage,
  type MessageExtensionScope,
} from '@/shared/message-extensions';
import { useFeature } from '@/shell/capabilities';

import { announcementKeys } from '../api/announcements.keys';
import type { AnnouncementView } from '../api/announcements.types';
import { useAnnouncementIntentStore } from '../store/announcement-intent.store';
import { makeMessage, makeQueryClient, makeScope, makeView, renderWithProviders } from './fixtures';
import '../register';

/**
 * Dòng trong menu nhấn giữ tin (app.md p5-04 §3): "Yêu cầu xác nhận đã đọc"/"…lại" · "Xem người đã xác nhận" · "Huỷ yêu cầu xác
 * nhận" — CHỈ ở kênh `ADMINS_ONLY` + người quản lý + tin gốc (luật hiển thị khớp BE: `ANN_001`, `channel.manage`).
 */
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@/shell/capabilities', () => ({ useFeature: jest.fn() }));
jest.mock('../api/announcements.service', () => ({ announcementsService: {} }));

const mockedFeature = jest.mocked(useFeature);
const MANAGER = makeScope({ canManage: true, postingPolicy: 'ADMINS_ONLY' });

async function renderRows(
  options: {
    message?: MessageExtensionMessage;
    onDone?: () => void;
    scope?: MessageExtensionScope;
    view?: AnnouncementView;
  } = {},
) {
  const queryClient = makeQueryClient();
  if (options.view) queryClient.setQueryData(announcementKeys.channel('ch-1'), [options.view]);
  await renderWithProviders(
    <MessageActionRowsSlot
      message={options.message ?? makeMessage()}
      scope={options.scope ?? MANAGER}
      onDone={options.onDone ?? jest.fn()}
    />,
    queryClient,
  );
}

const REQUEST = 'Yêu cầu xác nhận đã đọc';
const REQUEST_AGAIN = 'Yêu cầu xác nhận lại';
const RECEIPTS = 'Xem người đã xác nhận';
const CANCEL = 'Huỷ yêu cầu xác nhận';

beforeEach(() => {
  jest.clearAllMocks();
  mockedFeature.mockReturnValue(true);
  useAnnouncementIntentStore.setState({ intent: null, session: 0 });
});

describe('AnnouncementActionRows — hiển thị', () => {
  it('quản lý + kênh ADMINS_ONLY + tin gốc, chưa có yêu cầu → CHỈ "Yêu cầu xác nhận đã đọc"', async () => {
    await renderRows();

    expect(screen.getByText(REQUEST)).toBeOnTheScreen();
    expect(screen.queryByText(RECEIPTS)).toBeNull();
    expect(screen.queryByText(CANCEL)).toBeNull();
  });

  it('đang có yêu cầu còn hiệu lực → "Xem người đã xác nhận" + "Huỷ yêu cầu"; KHÔNG còn "Yêu cầu…"', async () => {
    await renderRows({ view: makeView({ canViewReceipts: true }) });

    expect(screen.getByText(RECEIPTS)).toBeOnTheScreen();
    expect(screen.getByText(CANCEL)).toBeOnTheScreen();
    expect(screen.queryByText(REQUEST)).toBeNull();
    expect(screen.queryByText(REQUEST_AGAIN)).toBeNull();
  });

  it('yêu cầu đã HẾT HẠN → "Yêu cầu xác nhận lại" (BE khôi phục), vẫn xem được danh sách và huỷ', async () => {
    await renderRows({
      view: makeView({
        canViewReceipts: true,
        deadlineAt: '2026-09-01T00:00:00.000Z',
        expired: true,
      }),
    });

    expect(screen.getByText(REQUEST_AGAIN)).toBeOnTheScreen();
    expect(screen.getByText(RECEIPTS)).toBeOnTheScreen();
    expect(screen.getByText(CANCEL)).toBeOnTheScreen();
  });

  it('không phải người quản lý → không tạo/huỷ được; người yêu cầu cũ (canViewReceipts) vẫn xem danh sách', async () => {
    await renderRows({ scope: makeScope({ canManage: false, postingPolicy: 'ADMINS_ONLY' }) });
    expect(screen.queryByText(REQUEST)).toBeNull();

    await renderRows({
      scope: makeScope({ canManage: false, postingPolicy: 'ADMINS_ONLY' }),
      view: makeView({ canViewReceipts: true }),
    });
    expect(screen.getByText(RECEIPTS)).toBeOnTheScreen();
    expect(screen.queryByText(CANCEL)).toBeNull();
  });

  it('kênh thường (MEMBERS) → không có dòng "Yêu cầu" (BE ANN_001)', async () => {
    await renderRows({ scope: makeScope({ canManage: true, postingPolicy: 'MEMBERS' }) });

    expect(screen.queryByText(REQUEST)).toBeNull();
  });

  it.each([
    ['tin trả lời (reply)', makeMessage({ threadId: 'root' }), MANAGER],
    ['tin đã thu hồi', makeMessage({ deleted: true }), MANAGER],
    ['tin hệ thống', makeMessage({ kind: 'SYSTEM' }), MANAGER],
    [
      'màn luồng',
      makeMessage(),
      makeScope({ canManage: true, postingPolicy: 'ADMINS_ONLY', threadId: 'root' }),
    ],
    ['hội thoại', makeMessage(), makeScope({ scopeType: 'CONVERSATION' })],
  ])('%s → không có dòng nào của feature', async (_name, message, scope) => {
    await renderRows({ message, scope });

    expect(screen.queryByText(REQUEST)).toBeNull();
    expect(screen.queryByText(RECEIPTS)).toBeNull();
    expect(screen.queryByText(CANCEL)).toBeNull();
  });

  it('cờ `readConfirm` tắt (hoặc chưa biết) → menu giữ nguyên hình dạng cũ', async () => {
    mockedFeature.mockReturnValue(false);
    await renderRows({ view: makeView({ canViewReceipts: true }) });
    expect(screen.queryByText(REQUEST)).toBeNull();
    expect(screen.queryByText(RECEIPTS)).toBeNull();

    mockedFeature.mockReturnValue(undefined);
    await renderRows();
    expect(screen.queryByText(REQUEST)).toBeNull();
  });
});

describe('AnnouncementActionRows — hành động', () => {
  it('"Yêu cầu…" → đóng menu (onDone) rồi ghi ý định mở tấm Yêu cầu (Host dựng tấm)', async () => {
    const onDone = jest.fn();
    await renderRows({ onDone });

    await fireEvent.press(screen.getByText(REQUEST));

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(useAnnouncementIntentStore.getState().intent).toEqual({
      channelId: 'ch-1',
      kind: 'request',
      messageId: 'm-1',
    });
  });

  it('"Huỷ yêu cầu xác nhận" → ghi ý định huỷ (Host dựng hộp thoại xác nhận)', async () => {
    const onDone = jest.fn();
    await renderRows({ onDone, view: makeView({ canViewReceipts: true }) });

    await fireEvent.press(screen.getByText(CANCEL));

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(useAnnouncementIntentStore.getState().intent).toEqual({
      channelId: 'ch-1',
      kind: 'cancel',
      messageId: 'm-1',
    });
  });

  it('"Xem người đã xác nhận" → mở route danh sách của kênh (cần cả wsId lẫn chId)', async () => {
    await renderRows({ view: makeView({ canViewReceipts: true }) });

    await fireEvent.press(screen.getByText(RECEIPTS));

    expect(router.push).toHaveBeenCalledWith({
      params: { chId: 'ch-1', messageId: 'm-1', wsId: 'ws-1' },
      pathname: '/workspaces/[wsId]/channels/[chId]/announcement/[messageId]',
    });
  });

  it('thiếu workspaceId (màn cha không truyền) → không có dòng "Xem người đã xác nhận" (không dựng route thiếu tham số)', async () => {
    await renderRows({
      scope: makeScope({ canManage: true, postingPolicy: 'ADMINS_ONLY', workspaceId: undefined }),
      view: makeView({ canViewReceipts: true }),
    });

    expect(screen.queryByText(RECEIPTS)).toBeNull();
  });
});
