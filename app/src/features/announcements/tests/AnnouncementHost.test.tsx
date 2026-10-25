import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { useConnectionState } from '@/core/socket';
import { ChatRoomHostSlot } from '@/shared/message-extensions';
import { useFeature } from '@/shell/capabilities';

import { announcementKeys } from '../api/announcements.keys';
import { announcementsService } from '../api/announcements.service';
import type { AnnouncementView } from '../api/announcements.types';
import { useAnnouncementIntentStore } from '../store/announcement-intent.store';
import { flushQuery, makeQueryClient, makeScope, makeView, renderWithProviders } from './fixtures';
import '../register';

/**
 * `AnnouncementHost` (khe `roomHost` của `chat`): MỘT lần mỗi phòng — tải danh sách yêu cầu của kênh (nguồn của mọi huy hiệu),
 * nghe socket, dựng tấm "Yêu cầu" / hộp thoại "Huỷ" mà dòng menu tin mở qua store. Chi tiết tấm/hộp thoại: các file
 * `RequestConfirmSheet.test.tsx` / `CancelRequestDialog.test.tsx`; ở đây chỉ kiểm phần NỐI của host.
 */
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('@/shell/capabilities', () => ({ useFeature: jest.fn() }));
jest.mock('@/core/socket', () => ({
  ...jest.requireActual('@/core/socket'),
  useConnectionState: jest.fn(),
}));
jest.mock('../api/announcements.service', () => ({
  announcementsService: { cancel: jest.fn(), create: jest.fn(), listByChannel: jest.fn() },
}));

const mockedFeature = jest.mocked(useFeature);
const mockedList = jest.mocked(announcementsService.listByChannel);
const mockedCreate = jest.mocked(announcementsService.create);
const mockedCancel = jest.mocked(announcementsService.cancel);

const intent = () => useAnnouncementIntentStore.getState();
const openRequest = (channelId = 'ch-1') =>
  act(async () => intent().requestConfirm({ channelId, messageId: 'm-1' }));
const openCancel = () =>
  act(async () => intent().requestCancel({ channelId: 'ch-1', messageId: 'm-1' }));

async function renderHost(scope = makeScope(), queryClient = makeQueryClient()) {
  await renderWithProviders(<ChatRoomHostSlot scope={scope} />, queryClient);
  await flushQuery(); // lượt tải danh sách lúc mount xong hẳn — không để cập nhật của React Query rơi ngoài `act`
  return queryClient;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedFeature.mockReturnValue(true);
  jest.mocked(useConnectionState).mockReturnValue('connected');
  mockedList.mockResolvedValue([]);
  mockedCreate.mockResolvedValue(makeView());
  mockedCancel.mockResolvedValue(undefined);
  useAnnouncementIntentStore.setState({ intent: null, session: 0 });
});

describe('AnnouncementHost — tải danh sách và điều kiện mount', () => {
  it('cờ bật → tải danh sách yêu cầu của KÊNH đúng một lần, vào cache theo kênh', async () => {
    mockedList.mockResolvedValue([makeView()]);
    const queryClient = await renderHost();

    await waitFor(() =>
      expect(
        queryClient.getQueryData<AnnouncementView[]>(announcementKeys.channel('ch-1')),
      ).toHaveLength(1),
    );
    expect(mockedList).toHaveBeenCalledTimes(1);
    expect(mockedList).toHaveBeenCalledWith('ch-1');
  });

  it.each([[false], [undefined]])(
    'cờ `readConfirm` = %s → KHÔNG tải, không dựng tấm dù có ý định mở',
    async (flag) => {
      mockedFeature.mockReturnValue(flag);
      await renderHost();
      await openRequest();

      expect(mockedList).not.toHaveBeenCalled();
      expect(screen.queryByText('Gửi yêu cầu')).toBeNull();
    },
  );

  it('hội thoại / màn luồng → host không mount (renderer trả null), không tải gì', async () => {
    await renderHost(makeScope({ scopeType: 'CONVERSATION' }));
    await renderHost(makeScope({ threadId: 'root' }));

    expect(mockedList).not.toHaveBeenCalled();
  });
});

describe('AnnouncementHost — dựng tấm / hộp thoại theo ý định', () => {
  it('ý định "yêu cầu" → hiện tấm; gửi → gọi API, xong thì xoá ý định', async () => {
    await renderHost();
    await openRequest();

    expect(await screen.findByText('Yêu cầu xác nhận đã đọc')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Gửi yêu cầu'));

    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith({ deadlineAt: undefined, messageId: 'm-1' }),
    );
    await waitFor(() => expect(intent().intent).toBeNull());
    await flushQuery();
  });

  it('ý định "huỷ" → hiện hộp thoại; xác nhận → gọi API, xong thì xoá ý định', async () => {
    await renderHost();
    await openCancel();

    expect(await screen.findByText('Huỷ yêu cầu xác nhận?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Huỷ yêu cầu'));

    await waitFor(() => expect(mockedCancel).toHaveBeenCalledWith('m-1'));
    await waitFor(() => expect(intent().intent).toBeNull());
    await flushQuery();
  });

  it('ý định của KÊNH KHÁC → host này không dựng gì', async () => {
    await renderHost();
    await openRequest('ch-khac');

    expect(screen.queryByText('Gửi yêu cầu')).toBeNull();
  });

  it('mỗi lần MỞ tấm tăng `session` (tấm dựng lại với hạn mặc định); đóng thì không tăng', async () => {
    await renderHost();
    await openRequest();
    const first = intent().session;

    await act(async () => intent().clear());
    expect(intent().session).toBe(first);

    await openRequest();
    expect(intent().session).toBe(first + 1);
  });

  it('rời phòng chat (unmount) → ý định đang mở của kênh này bị xoá, không treo sang lần vào kênh sau', async () => {
    const { unmount } = await renderWithProviders(<ChatRoomHostSlot scope={makeScope()} />);
    await flushQuery();
    await openRequest();
    expect(intent().intent).not.toBeNull();

    await unmount();

    expect(intent().intent).toBeNull();
  });

  it('unmount CHỈ xoá ý định của chính kênh mình — ý định của kênh khác (phòng khác đang mở) được giữ', async () => {
    const { unmount } = await renderWithProviders(<ChatRoomHostSlot scope={makeScope()} />);
    await flushQuery();
    await openRequest('ch-khac');

    await unmount();

    expect(intent().intent).toMatchObject({ channelId: 'ch-khac', kind: 'request' });
  });
});
