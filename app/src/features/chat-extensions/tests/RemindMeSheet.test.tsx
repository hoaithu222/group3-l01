import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { showToast } from '@/shared/utils/toast.utils';
import { serverNowMs } from '@/shell/store/slices/clock/clock.store';

import { reminderService } from '../api/reminder.service';
import { RemindMeSheet } from '../components/reminder/RemindMeSheet';
import { apiError, flushQuery, renderWithProviders } from './fixtures';

/**
 * `RemindMeSheet` (app.md §3, §8): "Sau 20 phút" · "Sau 1 giờ" · "Sáng mai 08:00" · "Thứ Hai tới 08:00" · "Chọn thời gian"; `REMIND_001/002` trong tấm; `MSG_012` → đóng + "Tin không còn khả dụng".
 * "Bây giờ" cố định = 10:00 Thứ ba 29/09/2026 (giờ máy).
 */
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('@/shell/store/slices/clock/clock.store', () => ({
  ...jest.requireActual('@/shell/store/slices/clock/clock.store'),
  serverNowMs: jest.fn(),
}));
jest.mock('@/shell/capabilities', () => ({ useCapabilities: () => ({ data: undefined }), useFeature: () => true }));
jest.mock('../api/reminder.service', () => ({ reminderService: { create: jest.fn() } }));

const service = jest.mocked(reminderService);
const NOW = new Date(2026, 8, 29, 10, 0, 0).getTime();

async function renderSheet(messageId: string | null = 'm-1') {
  const onClose = jest.fn();
  await renderWithProviders(<RemindMeSheet messageId={messageId} visible onClose={onClose} />);
  return { onClose };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(serverNowMs).mockReturnValue(NOW);
  service.create.mockResolvedValue({ id: 'r-1', remindAt: new Date(NOW + 20 * 60_000).toISOString() } as never);
});

describe('RemindMeSheet', () => {
  it('5 lựa chọn thời điểm đúng thứ tự của kế hoạch; mặc định "Sau 20 phút"', async () => {
    await renderSheet();

    for (const label of ['Sau 20 phút', 'Sau 1 giờ', 'Sáng mai 08:00', 'Thứ Hai tới 08:00', 'Chọn thời gian']) {
      expect(screen.getByRole('radio', { name: label })).toBeOnTheScreen();
    }
    expect(screen.getByText('Nhắc lúc 10:20 Thứ ba 29/09 (giờ máy)')).toBeOnTheScreen();
  });

  it('"Nhắc tôi" → POST remindAt UTC + timezone theo messageId; xong đóng tấm + toast "Sẽ nhắc bạn lúc …"', async () => {
    const { onClose } = await renderSheet();
    await fireEvent.press(screen.getByRole('radio', { name: 'Sáng mai 08:00' }));

    await fireEvent.press(screen.getByText('Nhắc tôi'));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    await flushQuery();
    expect(service.create).toHaveBeenCalledWith('m-1', {
      remindAt: new Date(2026, 8, 30, 8, 0).toISOString(),
      timezone: expect.any(String),
    });
    expect(showToast).toHaveBeenCalledWith('success', expect.stringMatching(/^Sẽ nhắc bạn lúc /));
  });

  it('REMIND_001 dưới ô giờ; REMIND_002 (đủ trần) trong cảnh báo — tấm ở lại', async () => {
    service.create.mockRejectedValueOnce(apiError(400, 'REMIND_001')).mockRejectedValueOnce(apiError(409, 'REMIND_002'));
    const { onClose } = await renderSheet();

    await fireEvent.press(screen.getByText('Nhắc tôi'));
    expect(await screen.findByText(/^Thời điểm nhắc phải sau ít nhất 1 phút/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Nhắc tôi'));
    expect(await screen.findByText(/Bạn đã đạt số lời nhắc tối đa/)).toBeOnTheScreen();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('MSG_012 (tin không còn đọc được) → đóng tấm + toast "Tin không còn khả dụng", KHÔNG hiện lỗi thô', async () => {
    service.create.mockRejectedValue(apiError(404, 'MSG_012'));
    const { onClose } = await renderSheet();

    await fireEvent.press(screen.getByText('Nhắc tôi'));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(showToast).toHaveBeenCalledWith('info', 'Tin không còn khả dụng');
    expect(screen.queryByText('Không tìm thấy tin nhắn trong cuộc trò chuyện này')).toBeNull();
    await flushQuery();
  });

  it('không có tin đích (ý định đóng) → bấm "Nhắc tôi" không gọi API', async () => {
    await renderSheet(null);

    await fireEvent.press(screen.getByText('Nhắc tôi'));

    expect(service.create).not.toHaveBeenCalled();
  });
});
