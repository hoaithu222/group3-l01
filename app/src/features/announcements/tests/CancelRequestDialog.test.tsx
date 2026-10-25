import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { showToast } from '@/shared/utils/toast.utils';

import { announcementKeys } from '../api/announcements.keys';
import { announcementsService } from '../api/announcements.service';
import type { AnnouncementView } from '../api/announcements.types';
import { CancelRequestDialog } from '../components/CancelRequestDialog';
import { apiError, flushQuery, makeQueryClient, makeView, renderWithProviders } from './fixtures';

/**
 * Hộp thoại "Huỷ yêu cầu xác nhận?" (app.md p5-04 §3): huỷ nhầm là mất huy hiệu của mọi người nên có hỏi lại (không lạc quan).
 * Đóng khi xong DÙ thành hay bại — lỗi đã có toast, để hộp thoại treo lại chỉ thêm một lượt bấm thừa.
 */
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/announcements.service', () => ({ announcementsService: { cancel: jest.fn() } }));

const mockedCancel = jest.mocked(announcementsService.cancel);
const mockedToast = jest.mocked(showToast);
const KEY = announcementKeys.channel('ch-1');

async function renderDialog(messageId: string | null = 'm-1') {
  const onClose = jest.fn();
  const queryClient = makeQueryClient();
  queryClient.setQueryData(KEY, [makeView(), makeView({ messageId: 'm-2' })]);
  await renderWithProviders(
    <CancelRequestDialog channelId="ch-1" messageId={messageId} visible onClose={onClose} />,
    queryClient,
  );
  return { onClose, queryClient };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedCancel.mockResolvedValue(undefined);
});

describe('CancelRequestDialog', () => {
  it('hỏi lại trước khi huỷ: có tiêu đề + hai nút "Huỷ yêu cầu" / "Giữ lại"', async () => {
    await renderDialog();

    expect(screen.getByText('Huỷ yêu cầu xác nhận?')).toBeOnTheScreen();
    expect(screen.getByText('Huỷ yêu cầu')).toBeOnTheScreen();
    expect(screen.getByText('Giữ lại')).toBeOnTheScreen();
    expect(mockedCancel).not.toHaveBeenCalled();
  });

  it('"Huỷ yêu cầu" → DELETE đúng tin, gỡ dòng khỏi cache (huy hiệu biến mất), toast, đóng', async () => {
    const { onClose, queryClient } = await renderDialog();

    await fireEvent.press(screen.getByText('Huỷ yêu cầu'));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    await flushQuery();
    expect(mockedCancel).toHaveBeenCalledWith('m-1');
    expect(
      queryClient.getQueryData<AnnouncementView[]>(KEY)?.map((view) => view.messageId),
    ).toEqual(['m-2']);
    expect(mockedToast).toHaveBeenCalledWith('success', 'Đã huỷ yêu cầu xác nhận');
  });

  it('"Giữ lại" → chỉ đóng, KHÔNG gọi API, cache nguyên vẹn', async () => {
    const { onClose, queryClient } = await renderDialog();

    await fireEvent.press(screen.getByText('Giữ lại'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockedCancel).not.toHaveBeenCalled();
    expect(queryClient.getQueryData<AnnouncementView[]>(KEY)).toHaveLength(2);
  });

  it('lỗi (403) → toast lý do, cache giữ nguyên, VẪN đóng hộp thoại', async () => {
    mockedCancel.mockRejectedValue(apiError(403, 'PERM_403'));
    const { onClose, queryClient } = await renderDialog();

    await fireEvent.press(screen.getByText('Huỷ yêu cầu'));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    await flushQuery();
    expect(mockedToast).toHaveBeenCalledWith('error', expect.any(String));
    expect(queryClient.getQueryData<AnnouncementView[]>(KEY)).toHaveLength(2);
  });

  it('không có tin đích (ý định đã xoá) → bấm huỷ không làm gì', async () => {
    const { onClose } = await renderDialog(null);

    await fireEvent.press(screen.getByText('Huỷ yêu cầu'));

    expect(mockedCancel).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
