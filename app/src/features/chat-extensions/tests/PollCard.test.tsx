import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { chatKeys, type MessagesData } from '@/features/chat';
import { useConnectionState } from '@/core/socket';
import { useAuthStore } from '@/shell/store/slices/auth';

import { pollService } from '../api/poll.service';
import { PollCard } from '../components/poll/PollCard';
import { findPoll } from '../utils/poll-cache';
import { useChatExtIntentStore } from '../store/chat-ext-intent.store';
import { apiError, flushQuery, makePoll, makePollMessage, makeQueryClient, renderWithProviders, SCOPE, seedPollCache } from './fixtures';

/**
 * `PollCard` (app.md §8): một đáp án — chọn B bỏ A; nhiều đáp án — chọn 2; đã kết thúc → không chạm được; ẩn danh → không có "Xem người bầu". Bầu đi qua `usePollVote` THẬT (service mock),
 * thẻ đọc `message.poll` từ cache tin nhắn nên các khẳng định đọc cả cache lẫn màn hình.
 */
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('@/core/socket', () => ({ ...jest.requireActual('@/core/socket'), useConnectionState: jest.fn() }));
jest.mock('../api/poll.service', () => ({ pollService: { close: jest.fn(), unvote: jest.fn(), vote: jest.fn() } }));

const service = jest.mocked(pollService);

async function renderCard(poll = makePoll(), message = {}) {
  const queryClient = makeQueryClient();
  seedPollCache(queryClient, poll);
  await renderWithProviders(<PollCard isOwn={false} message={makePollMessage({ poll, ...message })} scope={SCOPE} />, queryClient);
  return queryClient;
}
const cachePoll = (queryClient: Awaited<ReturnType<typeof renderCard>>) =>
  findPoll(queryClient.getQueryData<MessagesData>(chatKeys.messages(SCOPE)), 'msg-poll');

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useConnectionState).mockReturnValue('connected');
  useAuthStore.setState({ user: { id: 'u-me', name: 'Tôi' } as never });
  useChatExtIntentStore.setState({ intent: null, session: 0, visible: false });
  service.vote.mockResolvedValue(makePoll({ version: 4 }));
  service.unvote.mockResolvedValue(makePoll({ version: 4 }));
});

describe('PollCard — hiển thị', () => {
  it('câu hỏi, dòng thông tin (Chọn một), số phiếu + %, "N người đã bầu"; trợ năng: radio + nhãn đọc đủ', async () => {
    await renderCard();

    expect(screen.getByText('Ăn gì trưa nay?')).toBeOnTheScreen();
    expect(screen.getByText('Chọn một')).toBeOnTheScreen();
    expect(screen.getAllByText('1 · 50%')).toHaveLength(2);
    expect(screen.getByText('2 người đã bầu')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Phở, 1 phiếu, 50 phần trăm' })).toBeOnTheScreen();
  });

  it('nhãn: nhiều đáp án · ẩn danh · hạn chốt; khảo sát đã kết thúc → "Đã kết thúc"', async () => {
    await renderCard(makePoll({ anonymous: true, closesAt: '2099-12-31T13:30:00.000Z', multi: true }));
    expect(screen.getByText(/^Chọn nhiều · Ẩn danh · Kết thúc \d{2}:\d{2} \d{2}\/\d{2}$/)).toBeOnTheScreen();
  });

  it('chưa ai bầu → "Chưa có ai bầu"', async () => {
    await renderCard(makePoll({ options: [{ id: 'a', percent: 0, text: 'Phở', voteCount: 0 }, { id: 'b', percent: 0, text: 'Bún', voteCount: 0 }], voterCount: 0 }));
    expect(screen.getByText('Chưa có ai bầu')).toBeOnTheScreen();
  });
});

describe('PollCard — bầu chọn', () => {
  // Mutation kết thúc SAU khi test xong → cập nhật React ngoài `act`; chờ một nhịp trong `act` (chạy TRƯỚC cleanup của RNTL vì hook trong describe chạy trước hook gốc).
  afterEach(() => flushQuery());

  it('MỘT đáp án: chọn A rồi chọn B → PUT [b] (thay hẳn), A không còn được chọn', async () => {
    service.vote.mockResolvedValue(makePoll({ myOptionIds: ['b'], version: 4 }));
    const queryClient = await renderCard(makePoll({ myOptionIds: ['a'] }));

    await fireEvent.press(screen.getByRole('radio', { name: /^Bún/ }));

    await waitFor(() => expect(service.vote).toHaveBeenCalledWith('p-1', ['b']));
    expect(cachePoll(queryClient)?.myOptionIds).toEqual(['b']);
  });

  it('chạm lại đáp án đang chọn (một đáp án) → bỏ phiếu (DELETE)', async () => {
    await renderCard(makePoll({ myOptionIds: ['a'] }));

    await fireEvent.press(screen.getByRole('radio', { name: /^Phở/ }));

    await waitFor(() => expect(service.unvote).toHaveBeenCalledWith('p-1'));
    expect(service.vote).not.toHaveBeenCalled();
  });

  it('NHIỀU đáp án: chọn 2 lựa chọn → PUT [a, b]; role checkbox', async () => {
    await renderCard(makePoll({ multi: true, myOptionIds: ['a'] }));

    await fireEvent.press(screen.getByRole('checkbox', { name: /^Bún/ }));

    await waitFor(() => expect(service.vote).toHaveBeenCalledWith('p-1', ['a', 'b']));
  });

  it('đã kết thúc (CLOSED) → không chạm được (disabled), vẫn đọc được kết quả', async () => {
    await renderCard(makePoll({ closeReason: 'BY_CREATOR', status: 'CLOSED' }));

    await fireEvent.press(screen.getByRole('radio', { name: /^Phở/ }));

    expect(screen.getByRole('radio', { name: /^Phở/ })).toBeDisabled();
    expect(screen.getByText('Chọn một · Đã kết thúc')).toBeOnTheScreen();
    expect(service.vote).not.toHaveBeenCalled();
  });

  it('quá closesAt dù status còn OPEN (job đóng chưa chạy) → coi như đã kết thúc', async () => {
    await renderCard(makePoll({ closesAt: '2020-01-01T00:00:00.000Z' }));
    expect(screen.getByRole('radio', { name: /^Phở/ })).toBeDisabled();
  });

  it('ngoại tuyến → khoá lựa chọn + nhãn "Ngoại tuyến"', async () => {
    jest.mocked(useConnectionState).mockReturnValue('offline');
    await renderCard();

    expect(screen.getByRole('radio', { name: /^Phở/ })).toBeDisabled();
    expect(screen.getByText('Chọn một · Ngoại tuyến')).toBeOnTheScreen();
  });

  it('POLL_005/404 khi bầu → thẻ đổi sang "Khảo sát không còn khả dụng"', async () => {
    service.vote.mockRejectedValue(apiError(404, 'POLL_005'));
    await renderCard();

    await fireEvent.press(screen.getByRole('radio', { name: /^Phở/ }));

    expect(await screen.findByText('Khảo sát không còn khả dụng')).toBeOnTheScreen();
  });
});

describe('PollCard — người bầu & kết thúc', () => {
  afterEach(() => flushQuery());

  it('không ẩn danh + đã có người bầu → "Xem người bầu" ghi ý định mở tấm người bầu', async () => {
    await renderCard();

    await fireEvent.press(screen.getByText('Xem người bầu'));

    expect(useChatExtIntentStore.getState().intent).toMatchObject({ kind: 'voters', optionId: 'a', pollId: 'p-1', scopeKey: expect.stringContaining('ch-1') });
  });

  it('ẨN DANH → KHÔNG có nút "Xem người bầu" (kể cả người tạo)', async () => {
    useAuthStore.setState({ user: { id: 'u-author', name: 'Tác giả' } as never });
    await renderCard(makePoll({ anonymous: true }));

    expect(screen.queryByText('Xem người bầu')).toBeNull();
  });

  it('người thường (không phải người tạo, không phải moderator) KHÔNG có "Kết thúc khảo sát"', async () => {
    await renderCard();
    expect(screen.queryByText('Kết thúc khảo sát')).toBeNull();
  });

  it('người tạo (dù poll dùng chung từ socket có canClose=false): bấm "Kết thúc khảo sát" → hộp thoại xác nhận → POST close, thẻ đổi sang đã kết thúc', async () => {
    useAuthStore.setState({ user: { id: 'u-author', name: 'Tác giả' } as never });
    service.close.mockResolvedValue(makePoll({ closeReason: 'BY_CREATOR', status: 'CLOSED', version: 5 }));
    const queryClient = await renderCard();

    await fireEvent.press(screen.getByText('Kết thúc khảo sát'));
    expect(service.close).not.toHaveBeenCalled(); // cần xác nhận
    await fireEvent.press(screen.getByText('Kết thúc'));

    await waitFor(() => expect(service.close).toHaveBeenCalledWith('p-1'));
    await waitFor(() => expect(cachePoll(queryClient)?.status).toBe('CLOSED'));
  });

  it('moderator (myPermissions.canModerate) cũng có "Kết thúc khảo sát"', async () => {
    await renderCard(makePoll(), { myPermissions: { canModerate: true } });
    expect(screen.getByText('Kết thúc khảo sát')).toBeOnTheScreen();
  });

  it('khảo sát đã kết thúc thì không còn nút kết thúc dù là người tạo', async () => {
    useAuthStore.setState({ user: { id: 'u-author', name: 'Tác giả' } as never });
    await renderCard(makePoll({ status: 'CLOSED' }));
    expect(screen.queryByText('Kết thúc khảo sát')).toBeNull();
  });
});
