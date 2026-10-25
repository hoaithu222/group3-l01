import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { showToast } from '@/shared/utils/toast.utils';

import { pollService } from '../api/poll.service';
import { PollVotersSheet } from '../components/poll/PollVotersSheet';
import type { VotersTarget } from '../store/chat-ext-intent.store';
import { apiError, cursorPage, flushQuery, renderWithProviders } from './fixtures';

/**
 * `PollVotersSheet` (app.md §3 `PollVotersScreen`): chip đổi lựa chọn, danh sách người (cuộn "Xem thêm"), "Chưa ai chọn", `POLL_006` → "Khảo sát ẩn danh", 404 → đóng + báo.
 * Dựng dạng tấm (không thêm route vào bảng typed routes đã ~190 mục).
 */
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/poll.service', () => ({ pollService: { voters: jest.fn() } }));

const service = jest.mocked(pollService);
const TARGET: VotersTarget = {
  optionId: 'a',
  options: [{ id: 'a', text: 'Phở' }, { id: 'b', text: 'Bún' }],
  pollId: 'p-1',
  question: 'Ăn gì trưa nay?',
};
const person = (name: string) => ({ avatar: null, id: `u-${name}`, name, votedAt: '2026-09-27T01:00:00.000Z' });

async function renderSheet(target: VotersTarget | null = TARGET) {
  const onClose = jest.fn();
  await renderWithProviders(<PollVotersSheet target={target} visible onClose={onClose} />);
  return { onClose };
}

beforeEach(() => {
  jest.clearAllMocks();
  service.voters.mockImplementation(async (_id, { optionId }) =>
    cursorPage(optionId === 'a' ? [person('An'), person('Bình')] : []),
  );
});

describe('PollVotersSheet', () => {
  it('hiện câu hỏi, chip lựa chọn (đang chọn = lựa chọn mở ra) và người đã chọn', async () => {
    await renderSheet();

    expect(await screen.findByText('An')).toBeOnTheScreen();
    expect(screen.getByText('Bình')).toBeOnTheScreen();
    expect(screen.getByText('Ăn gì trưa nay?')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Phở' })).toBeChecked();
    expect(service.voters).toHaveBeenCalledWith('p-1', { cursor: undefined, optionId: 'a' });
    await flushQuery();
  });

  it('đổi sang lựa chọn khác → gọi lại theo optionId mới; lựa chọn chưa ai chọn → "Chưa ai chọn"', async () => {
    await renderSheet();
    await screen.findByText('An');

    await fireEvent.press(screen.getByRole('radio', { name: 'Bún' }));

    expect(await screen.findByText('Chưa ai chọn')).toBeOnTheScreen();
    expect(service.voters).toHaveBeenLastCalledWith('p-1', { cursor: undefined, optionId: 'b' });
    await flushQuery();
  });

  it('có trang sau → "Xem thêm" tải tiếp theo cursor', async () => {
    service.voters.mockResolvedValueOnce(cursorPage([person('An')], { hasMore: true, nextCursor: 'c2' }));
    service.voters.mockResolvedValueOnce(cursorPage([person('Chi')]));
    await renderSheet();

    await fireEvent.press(await screen.findByText('Xem thêm'));

    expect(await screen.findByText('Chi')).toBeOnTheScreen();
    expect(service.voters).toHaveBeenLastCalledWith('p-1', { cursor: 'c2', optionId: 'a' });
    await flushQuery();
  });

  it('POLL_006 (khảo sát ẩn danh) → giải thích, KHÔNG có nút thử lại', async () => {
    service.voters.mockRejectedValue(apiError(403, 'POLL_006'));
    await renderSheet();

    expect(await screen.findByText('Khảo sát ẩn danh')).toBeOnTheScreen();
    expect(screen.getByText('Khảo sát ẩn danh không hiển thị danh sách người bầu')).toBeOnTheScreen();
    expect(screen.queryByText('Thử lại')).toBeNull();
  });

  it('404 (mất quyền kênh / khảo sát biến mất) → đóng tấm + toast', async () => {
    service.voters.mockRejectedValue(apiError(404, 'POLL_005'));
    const { onClose } = await renderSheet();

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(showToast).toHaveBeenCalledWith('info', 'Khảo sát không còn khả dụng');
  });

  it('lỗi khác → câu tiếng Việt + Thử lại tải lại', async () => {
    service.voters.mockRejectedValueOnce(apiError(500, 'SYS_500'));
    await renderSheet();

    await fireEvent.press(await screen.findByText('Thử lại'));

    expect(await screen.findByText('An')).toBeOnTheScreen();
    await flushQuery();
  });

  it('không có ý định mở (target null) → không gọi API', async () => {
    await renderSheet(null);
    expect(service.voters).not.toHaveBeenCalled();
  });
});
