import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';

import { apiClient } from '@/core/api/client';
import { useModerationActions } from '@/shared/hooks/useModerationActions';
import { useBlockedUsersStore } from '@/shared/stores/blocked-users.store';
import { useModerationIntentStore } from '@/shared/stores/moderation-intent.store';
import { showToast } from '@/shared/utils/toast.utils';

import { ModerationHost } from '../components/ModerationHost';
import { apiError, envelope, renderWithProviders } from './test-utils';

/**
 * `ModerationHost` + `useModerationActions` (p1-08): cầu nối để `chat`/`members`/`channels`/`conversations` mở
 * `ReportSheet`/`BlockConfirmSheet` mà KHÔNG import `moderation`. Kiểm luồng đầu-cuối: yêu cầu qua hook chung →
 * tấm hiện → gọi đúng API → tấm đóng; và hộp xác nhận Chặn nói hậu quả, xử lý BLOCK_004.
 */

jest.mock('@/core/api/client', () => ({ apiClient: { get: jest.fn(), post: jest.fn(), delete: jest.fn() } }));
jest.mock('@/core/socket', () => ({ useConnectionState: () => 'connected' }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

const post = jest.mocked(apiClient.post);
const del = jest.mocked(apiClient.delete);

let actions: ReturnType<typeof useModerationActions>;
function CaptureActions() {
  const current = useModerationActions();
  // Ghi vào biến ngoài trong effect (không phải lúc render) — `react-hooks/globals` cấm ghi biến ngoài khi render.
  useEffect(() => {
    actions = current;
  });
  return null;
}

async function renderHost() {
  await renderWithProviders(
    <>
      <CaptureActions />
      <ModerationHost />
    </>,
  );
}

describe('ModerationHost — báo cáo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useModerationIntentStore.getState().reset();
    useBlockedUsersStore.getState().reset();
  });

  it('chưa có yêu cầu ⇒ không dựng tấm nào', async () => {
    await renderHost();
    expect(screen.queryByText('Báo cáo tin nhắn')).toBeNull();
    expect(screen.queryByText(/Chặn .*\?/)).toBeNull();
  });

  it('reportMessage từ menu tin ⇒ tấm "Báo cáo tin nhắn" hiện; gửi xong bấm Xong ⇒ tấm đóng (store về null)', async () => {
    post.mockResolvedValue(envelope({ id: 'r-1', status: 'OPEN', createdAt: 'x', alreadyReported: false }, undefined, 201));
    await renderHost();

    await act(async () => actions.reportMessage({ id: 'm-1', authorId: 'u-2' }));
    expect(await screen.findByText('Báo cáo tin nhắn')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Lừa đảo'));
    await fireEvent.press(screen.getByRole('button', { name: 'Gửi báo cáo' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Xong' }));

    expect(useModerationIntentStore.getState().report).toBeNull();
  });

  it('mở báo cáo CÙNG một tin lần hai ⇒ form mới, không còn biên nhận "Đã gửi" của lần trước', async () => {
    post.mockResolvedValue(envelope({ id: 'r-1', status: 'OPEN', createdAt: 'x', alreadyReported: false }, undefined, 201));
    await renderHost();

    await act(async () => actions.reportMessage({ id: 'm-1', authorId: 'u-2' }));
    await fireEvent.press(await screen.findByText('Spam'));
    await fireEvent.press(screen.getByRole('button', { name: 'Gửi báo cáo' }));
    await screen.findByText('Đã gửi báo cáo. Cảm ơn bạn.');
    await fireEvent.press(screen.getByRole('button', { name: 'Xong' }));

    await act(async () => actions.reportMessage({ id: 'm-1', authorId: 'u-2' }));
    expect(await screen.findByText('Chọn lý do phù hợp nhất. Người bị báo cáo không biết ai đã báo cáo.')).toBeOnTheScreen();
    expect(screen.queryByText('Đã gửi báo cáo. Cảm ơn bạn.')).toBeNull();
  });

  it('reportUser/reportChannel/reportConversation đặt đúng loại đích + tiêu đề', async () => {
    await renderHost();

    await act(async () => actions.reportUser('u-9', 'Bình', 'ws-1'));
    expect(await screen.findByText('Báo cáo Bình')).toBeOnTheScreen();

    await act(async () => actions.reportChannel('ch-1', 'chung'));
    expect(await screen.findByText('Báo cáo kênh')).toBeOnTheScreen();

    await act(async () => actions.reportConversation('cv-1', 'Nhóm X'));
    expect(await screen.findByText('Báo cáo nhóm chat')).toBeOnTheScreen();
    expect(useModerationIntentStore.getState().report).toEqual({ targetType: 'CONVERSATION', targetId: 'cv-1', name: 'Nhóm X' });
  });
});

describe('ModerationHost — chặn / bỏ chặn', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useModerationIntentStore.getState().reset();
    useBlockedUsersStore.getState().reset();
  });

  it('blockUser ⇒ hộp xác nhận nói hậu quả và KHÔNG chặn ngay; xác nhận ⇒ POST /me/blocks { userId }, tập chặn có id, đóng hộp', async () => {
    post.mockResolvedValue(envelope({ userId: 'u-2', blockedAt: 'x' }, undefined, 201));
    await renderHost();

    await act(async () => actions.blockUser('u-2', 'An'));
    expect(await screen.findByText('Chặn An?')).toBeOnTheScreen();
    expect(screen.getByText(/Họ không được báo về việc này/)).toBeOnTheScreen();
    expect(post).not.toHaveBeenCalled();
    expect(useBlockedUsersStore.getState().ids.has('u-2')).toBe(false);

    await fireEvent.press(screen.getByRole('button', { name: 'Chặn' }));

    await waitFor(() => expect(post).toHaveBeenCalledWith('/me/blocks', { userId: 'u-2' }, { skipErrorToast: true }));
    await waitFor(() => expect(useModerationIntentStore.getState().block).toBeNull());
    expect(useBlockedUsersStore.getState().ids.has('u-2')).toBe(true);
    expect(showToast).toHaveBeenCalledWith('success', 'Đã chặn An');
  });

  it('BLOCK_004 (quá 500 người) ⇒ câu giới hạn TRONG hộp, hộp còn mở, tập chặn được hoàn lại', async () => {
    post.mockRejectedValue(apiError(409, 'BLOCK_004'));
    await renderHost();

    await act(async () => actions.blockUser('u-2', 'An'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Chặn' }));

    expect(await screen.findByText('Bạn đã chặn số người tối đa. Hãy bỏ chặn bớt trước khi chặn thêm')).toBeOnTheScreen();
    expect(useModerationIntentStore.getState().block).not.toBeNull();
    expect(useBlockedUsersStore.getState().ids.has('u-2')).toBe(false);
  });

  it('BLOCK_001 (tự chặn mình) ⇒ hiện câu của bảng mã lỗi', async () => {
    post.mockRejectedValue(apiError(400, 'BLOCK_001'));
    await renderHost();

    await act(async () => actions.blockUser('me', 'Tôi'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Chặn' }));

    expect(await screen.findByText('Không thể thực hiện với chính bạn')).toBeOnTheScreen();
  });

  it('unblockUser ⇒ "Bỏ chặn {tên}?"; xác nhận ⇒ DELETE /me/blocks/:id và tập chặn mất id', async () => {
    del.mockResolvedValue(envelope(null));
    useBlockedUsersStore.getState().hydrate(['u-2']);
    await renderHost();

    await act(async () => actions.unblockUser('u-2', 'An'));
    expect(await screen.findByText('Bỏ chặn An?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Bỏ chặn' }));

    await waitFor(() => expect(del).toHaveBeenCalledWith('/me/blocks/u-2', { skipErrorToast: true }));
    expect(useBlockedUsersStore.getState().ids.has('u-2')).toBe(false);
  });
});
