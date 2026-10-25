import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useConnectionState } from '@/core/socket';
import type { ComposerDraftSnapshot } from '@/shared/message-extensions';
import { showToast } from '@/shared/utils/toast.utils';
import { serverNowMs } from '@/shell/store/slices/clock/clock.store';

import { scheduledMessageService } from '../api/scheduled-message.service';
import { ScheduleSendSheet } from '../components/schedule/ScheduleSendSheet';
import { apiError, flushQuery, renderWithProviders, SCOPE } from './fixtures';

/**
 * `ScheduleSendSheet` (app.md §8): gợi ý đã qua bị ẩn; chọn giờ < 1 phút → lỗi tại chỗ; gửi payload `sendAt` UTC + `timezone`. "Bây giờ" cố định = 21:30 Thứ bảy 26/09/2026 (giờ máy)
 * để các gợi ý có kết quả xác định bất kể ngày chạy test.
 */
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('@/core/socket', () => ({ ...jest.requireActual('@/core/socket'), useConnectionState: jest.fn() }));
jest.mock('@/shell/store/slices/clock/clock.store', () => ({
  ...jest.requireActual('@/shell/store/slices/clock/clock.store'),
  serverNowMs: jest.fn(),
}));
jest.mock('@/shell/capabilities', () => ({ useCapabilities: () => ({ data: undefined }), useFeature: () => true }));
jest.mock('../api/scheduled-message.service', () => ({ scheduledMessageService: { create: jest.fn() } }));

const service = jest.mocked(scheduledMessageService);
const NOW = new Date(2026, 8, 26, 21, 30, 0).getTime();

const makeDraft = (overrides: Partial<ComposerDraftSnapshot> = {}): ComposerDraftSnapshot => ({
  attachmentAssetIds: ['a-1'],
  canSubmit: true,
  consume: jest.fn(),
  content: 'Nhớ nộp báo cáo',
  mentions: [{ targetId: 'u-2', type: 'USER' }],
  ...overrides,
});

async function renderSheet(draft = makeDraft()) {
  const onClose = jest.fn();
  await renderWithProviders(<ScheduleSendSheet draft={draft} scope={SCOPE} visible onClose={onClose} />);
  return { draft, onClose };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(serverNowMs).mockReturnValue(NOW);
  jest.mocked(useConnectionState).mockReturnValue('connected');
  service.create.mockResolvedValue({ id: 's-1', sendAt: new Date(NOW + 3_600_000).toISOString() } as never);
});

describe('ScheduleSendSheet — gợi ý và tóm tắt', () => {
  it('xem trước nội dung + số tệp; gợi ý mốc ĐÃ QUA ("Tối nay 20:00") bị ẩn lúc 21:30', async () => {
    await renderSheet();

    expect(screen.getByText('Nhớ nộp báo cáo')).toBeOnTheScreen();
    expect(screen.getByText('1 tệp đính kèm')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Sau 1 giờ' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Sáng mai 08:00' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Thứ Hai tới 08:00' })).toBeOnTheScreen();
    expect(screen.queryByRole('radio', { name: 'Tối nay 20:00' })).toBeNull();
  });

  it('mặc định chọn gợi ý đầu và tóm tắt CHÍNH XÁC theo giờ máy: "Gửi lúc 22:30 Thứ bảy 26/09 (giờ máy)"', async () => {
    await renderSheet();
    expect(screen.getByText('Gửi lúc 22:30 Thứ bảy 26/09 (giờ máy)')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('radio', { name: 'Thứ Hai tới 08:00' }));

    expect(screen.getByText('Gửi lúc 08:00 Thứ hai 28/09 (giờ máy)')).toBeOnTheScreen();
  });
});

describe('ScheduleSendSheet — gửi', () => {
  it('"Hẹn gửi" → payload sendAt ISO UTC + timezone + nội dung/nhắc tên/tệp; xong: consume() nháp, đóng tấm, toast giờ', async () => {
    const { draft, onClose } = await renderSheet();

    await fireEvent.press(screen.getByText('Hẹn gửi'));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    await flushQuery();
    const [scope, input] = service.create.mock.calls[0]!;
    expect(scope).toMatchObject({ scopeId: 'ch-1', scopeType: 'CHANNEL' });
    expect(input).toMatchObject({
      attachmentAssetIds: ['a-1'],
      content: 'Nhớ nộp báo cáo',
      mentions: [{ targetId: 'u-2', type: 'USER' }],
      sendAt: new Date(NOW + 3_600_000).toISOString(),
    });
    expect(input.timezone).toEqual(expect.any(String));
    expect(input.timezone.length).toBeGreaterThan(2);
    expect(draft.consume).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('success', expect.stringMatching(/^Đã hẹn gửi lúc \d{2}:\d{2} /));
  });

  it('chọn giờ tự chọn thiếu ngày/giờ → lỗi tại chỗ, KHÔNG gọi API', async () => {
    await renderSheet();
    await fireEvent.press(screen.getByRole('radio', { name: 'Chọn thời gian' }));

    await fireEvent.press(screen.getByText('Hẹn gửi'));

    expect(await screen.findByText('Hãy chọn ngày và giờ')).toBeOnTheScreen();
    expect(service.create).not.toHaveBeenCalled();
  });

  it('để tấm mở quá lâu: gợi ý "Sau 1 giờ" thành quá khứ lúc bấm → lỗi giờ TẠI CHỖ (< 1 phút), không tốn lượt mạng', async () => {
    const { draft, onClose } = await renderSheet();
    jest.mocked(serverNowMs).mockReturnValue(NOW + 2 * 3_600_000); // hai tiếng sau

    await fireEvent.press(screen.getByText('Hẹn gửi'));

    expect((await screen.findAllByText('Thời điểm gửi phải sau ít nhất 1 phút kể từ bây giờ')).length).toBeGreaterThan(0);
    expect(service.create).not.toHaveBeenCalled();
    expect(draft.consume).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('SCHED_001 từ BE → hiện lỗi giờ trong tấm, KHÔNG consume, KHÔNG đóng', async () => {
    service.create.mockRejectedValue(apiError(400, 'SCHED_001'));
    const { draft, onClose } = await renderSheet();

    await fireEvent.press(screen.getByText('Hẹn gửi'));

    expect(await screen.findByText(/^Thời điểm gửi phải sau ít nhất 1 phút/)).toBeOnTheScreen();
    expect(draft.consume).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('SCHED_002 (đủ trần) → cảnh báo + "Xem tin đã hẹn" mở danh sách; MSG_004 → "Bạn không thể gửi tin ở đây"', async () => {
    service.create.mockRejectedValueOnce(apiError(409, 'SCHED_002')).mockRejectedValueOnce(apiError(403, 'MSG_004'));
    const { onClose } = await renderSheet();

    await fireEvent.press(screen.getByText('Hẹn gửi'));
    expect(await screen.findByText(/Bạn đã đạt số tin hẹn giờ tối đa/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Xem tin đã hẹn'));
    expect(router.push).toHaveBeenCalledWith('/me/scheduled-messages');
    expect(onClose).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByText('Hẹn gửi'));
    expect(await screen.findByText('Bạn không thể gửi tin ở đây')).toBeOnTheScreen();
  });

  it('ngoại tuyến → nút "Kết nối lại để gửi" khoá', async () => {
    jest.mocked(useConnectionState).mockReturnValue('offline');
    await renderSheet();

    await fireEvent.press(screen.getByText('Kết nối lại để gửi'));

    expect(service.create).not.toHaveBeenCalled();
  });
});
