import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { apiClient } from '@/core/api/client';
import { useBlockedUsersStore } from '@/shared/stores/blocked-users.store';
import type { ReportRequest } from '@/shared/stores/moderation-intent.store';

import { ReportSheet } from '../components/ReportSheet';
import { apiError, envelope, renderWithProviders } from './test-utils';

/**
 * `ReportSheet` (p1-08 #7): validate lý do/mô tả, gọi ĐÚNG hợp đồng `POST /reports` cho từng loại đích, và
 * ba nhánh lỗi của app.md §3 (`MOD_002/003/006`, `BLOCK_001`) hiện TRONG tấm. Ranh giới mock là `apiClient` —
 * kiểm luôn đường dẫn + thân request, không chỉ "service được gọi".
 */

jest.mock('@/core/api/client', () => ({ apiClient: { get: jest.fn(), post: jest.fn(), delete: jest.fn() } }));
jest.mock('@/core/socket', () => ({ useConnectionState: () => 'connected' }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

const post = jest.mocked(apiClient.post);
const MESSAGE: ReportRequest = { targetType: 'MESSAGE', targetId: 'm-1', authorId: 'u-2' };
const CREATED = { id: 'r-1', status: 'OPEN', createdAt: '2026-09-19T00:00:00.000Z', alreadyReported: false };

const sendButton = () => screen.getByRole('button', { name: 'Gửi báo cáo' });

async function renderSheet(request: ReportRequest = MESSAGE) {
  const onClose = jest.fn();
  await renderWithProviders(<ReportSheet request={request} onClose={onClose} />);
  return onClose;
}

describe('ReportSheet — validate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useBlockedUsersStore.getState().reset();
  });

  it('chưa chọn lý do ⇒ nút Gửi khoá; chọn "Spam" ⇒ mở khoá (mô tả không bắt buộc)', async () => {
    await renderSheet();
    expect(sendButton()).toBeDisabled();

    await fireEvent.press(screen.getByText('Spam'));
    expect(sendButton()).toBeEnabled();
  });

  it('"Khác" + mô tả ngắn (< 10 ký tự) ⇒ khoá và báo lỗi; đủ 10 ký tự (sau khi cắt khoảng trắng) ⇒ mở', async () => {
    await renderSheet();
    await fireEvent.press(screen.getByText('Khác'));
    expect(sendButton()).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText(/Mô tả/), '  quá ngắn  ');
    expect(sendButton()).toBeDisabled();
    expect(screen.getByText(/ít nhất 10 ký tự khi chọn "Khác"/)).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText(/Mô tả/), '  đã đủ mười ký tự  ');
    expect(sendButton()).toBeEnabled();
  });
});

describe('ReportSheet — gọi API đúng hợp đồng', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useBlockedUsersStore.getState().reset();
  });

  it('tin nhắn: POST /reports { targetType, targetId, reason } — mô tả rỗng thì KHÔNG gửi trường description', async () => {
    post.mockResolvedValue(envelope(CREATED, undefined, 201));
    await renderSheet();

    await fireEvent.press(screen.getByText('Quấy rối'));
    await fireEvent.press(sendButton());

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith(
      '/reports',
      { targetType: 'MESSAGE', targetId: 'm-1', reason: 'HARASSMENT' },
      { skipErrorToast: true },
    );
    expect(await screen.findByText('Đã gửi báo cáo. Cảm ơn bạn.')).toBeOnTheScreen();
  });

  it('người dùng trong nhóm: kèm contextWorkspaceId + description đã cắt khoảng trắng', async () => {
    post.mockResolvedValue(envelope(CREATED, undefined, 201));
    await renderSheet({ targetType: 'USER', targetId: 'u-9', name: 'Bình', contextWorkspaceId: 'ws-1' });
    expect(screen.getByText('Báo cáo Bình')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Lừa đảo'));
    await fireEvent.changeText(screen.getByLabelText(/Mô tả/), '  mời chuyển tiền  ');
    await fireEvent.press(sendButton());

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]?.[1]).toEqual({
      targetType: 'USER',
      targetId: 'u-9',
      reason: 'SCAM',
      description: 'mời chuyển tiền',
      contextWorkspaceId: 'ws-1',
    });
  });

  it('BE trả 200 alreadyReported ⇒ biên nhận nói rõ "đã báo cáo trước đó", không hứa đã gửi mới', async () => {
    post.mockResolvedValue(envelope({ ...CREATED, alreadyReported: true }));
    await renderSheet({ targetType: 'CHANNEL', targetId: 'ch-1' });
    expect(screen.getByText('Báo cáo kênh')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Spam'));
    await fireEvent.press(sendButton());

    expect(await screen.findByText('Bạn đã báo cáo nội dung này trước đó')).toBeOnTheScreen();
  });

  it('tick "Chặn người gửi" ⇒ gọi HAI request: POST /reports rồi POST /me/blocks { userId: tác giả }, và tập chặn có tác giả', async () => {
    post.mockResolvedValueOnce(envelope(CREATED, undefined, 201)).mockResolvedValueOnce(envelope({ userId: 'u-2', blockedAt: 'x' }, undefined, 201));
    await renderSheet();

    await fireEvent.press(screen.getByText('Spam'));
    await fireEvent.press(screen.getByText('Chặn người gửi tin nhắn này'));
    await fireEvent.press(sendButton());

    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls[0]?.[0]).toBe('/reports');
    expect(post.mock.calls[1]).toEqual(['/me/blocks', { userId: 'u-2' }, { skipErrorToast: true }]);
    expect(useBlockedUsersStore.getState().ids.has('u-2')).toBe(true);
    expect(await screen.findByText('Bạn cũng đã chặn người này.')).toBeOnTheScreen();
  });

  it('báo cáo thành công nhưng chặn thất bại ⇒ báo cáo VẪN ghi nhận, biên nhận nói chưa chặn được', async () => {
    post.mockResolvedValueOnce(envelope(CREATED, undefined, 201)).mockRejectedValueOnce(apiError(409, 'BLOCK_004'));
    await renderSheet();

    await fireEvent.press(screen.getByText('Spam'));
    await fireEvent.press(screen.getByText('Chặn người gửi tin nhắn này'));
    await fireEvent.press(sendButton());

    expect(await screen.findByText('Đã gửi báo cáo. Cảm ơn bạn.')).toBeOnTheScreen();
    expect(screen.getByText(/Chưa chặn được người này/)).toBeOnTheScreen();
    // Lạc quan đã được hoàn lại: không lừa người dùng rằng đã chặn.
    expect(useBlockedUsersStore.getState().ids.has('u-2')).toBe(false);
  });

  it('kênh/nhóm chat: không có ô "Chặn"', async () => {
    await renderSheet({ targetType: 'CONVERSATION', targetId: 'cv-1', name: 'Nhóm X' });
    await fireEvent.press(screen.getByText('Spam'));
    expect(screen.queryByText('Chặn người này')).toBeNull();
    expect(screen.queryByText('Chặn người gửi tin nhắn này')).toBeNull();
  });
});

describe('ReportSheet — lỗi hiện TRONG tấm', () => {
  beforeEach(() => jest.clearAllMocks());

  async function submitWith(error: unknown) {
    post.mockRejectedValue(error);
    await renderSheet();
    await fireEvent.press(screen.getByText('Spam'));
    await fireEvent.press(sendButton());
  }

  it('MOD_002 (404) ⇒ "Nội dung không còn khả dụng", vẫn đóng được tấm', async () => {
    await submitWith(apiError(404, 'MOD_002'));
    expect(await screen.findByText('Nội dung không còn khả dụng')).toBeOnTheScreen();
  });

  it('MOD_003 ⇒ câu chỉ hướng báo cáo NGƯỜI DÙNG (tin hệ thống / 1-1)', async () => {
    await submitWith(apiError(400, 'MOD_003'));
    expect(await screen.findByText(/hãy báo cáo người dùng/)).toBeOnTheScreen();
  });

  it('MOD_006 (429) kèm retryAfterSeconds ⇒ nói rõ thử lại sau bao lâu', async () => {
    await submitWith(apiError(429, 'MOD_006', { retryAfterSeconds: 1500 }));
    expect(await screen.findByText('Bạn đã gửi quá nhiều báo cáo. Thử lại sau khoảng 25 phút.')).toBeOnTheScreen();
  });

  it('BLOCK_001 ⇒ "không thể báo cáo chính mình"', async () => {
    await submitWith(apiError(400, 'BLOCK_001'));
    expect(await screen.findByText('Bạn không thể báo cáo chính mình.')).toBeOnTheScreen();
  });

  it('gửi lỗi xong sửa lại được: nút Gửi mở khoá lại, không kẹt ở trạng thái đang gửi', async () => {
    await submitWith(apiError(404, 'MOD_002'));
    await screen.findByText('Nội dung không còn khả dụng');
    await act(async () => {});
    expect(sendButton()).toBeEnabled();
  });
});
