import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { contributionService } from '../api/contribution.service';
import { ExportReportButton } from '../components/ExportReportButton';
import { BOARD } from './fixtures';
import { httpError, renderWithClient } from './harness';

/**
 * Nút + tấm "Xuất báo cáo PDF" (app.md §3, §8): kỳ đang xem, có/không kèm heatmap → `POST …/export`; thành công báo `exportId` cho màn; quá 5 lần/giờ (429)
 * → đếm ngược và khoá nút. Mock ở tầng service (không mạng).
 */
jest.mock('../api/contribution.service', () => ({
  ...jest.requireActual('../api/contribution.service'),
  contributionService: { createExport: jest.fn() },
}));

const mockedCreate = contributionService.createExport as jest.Mock;
const onCreated = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockedCreate.mockResolvedValue({ exportId: 'e-1', status: 'QUEUED' });
});

async function openSheet(period = 'M:2026-09', disabled = false) {
  await renderWithClient(<ExportReportButton boardId={BOARD} disabled={disabled} period={period} onCreated={onCreated} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Xuất báo cáo PDF' }));
}

describe('ExportReportButton', () => {
  it('mở tấm: ghi rõ kỳ đang xem, mặc định KÈM biểu đồ hoạt động', async () => {
    await openSheet();

    expect(await screen.findByText('Kỳ: Tháng 9/2026')).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Kèm biểu đồ hoạt động' })).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Kèm biểu đồ hoạt động' }).props.accessibilityState).toMatchObject({ checked: true });
  });

  it('"Tạo báo cáo" → POST đúng kỳ + includeHeatmap, báo exportId cho màn và đóng tấm', async () => {
    await openSheet('W:2026-W37');

    await fireEvent.press(await screen.findByRole('button', { name: 'Tạo báo cáo' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('e-1'));
    expect(mockedCreate).toHaveBeenCalledWith(BOARD, { includeHeatmap: true, period: 'W:2026-W37' });
    await waitFor(() => expect(screen.queryByText('Kỳ: Tuần 37/2026 · 07–13/09')).toBeNull());
  });

  it('tắt "Kèm biểu đồ hoạt động" → includeHeatmap false', async () => {
    await openSheet('ALL');

    await fireEvent.press(await screen.findByRole('switch', { name: 'Kèm biểu đồ hoạt động' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Tạo báo cáo' }));

    await waitFor(() => expect(mockedCreate).toHaveBeenCalledWith(BOARD, { includeHeatmap: false, period: 'ALL' }));
  });

  it('offline (disabled) → nút xuất bị khoá, không mở được tấm', async () => {
    await renderWithClient(<ExportReportButton boardId={BOARD} disabled period="ALL" onCreated={onCreated} />);

    expect(screen.getByRole('button', { name: 'Xuất báo cáo PDF' })).toBeDisabled();
  });

  it('429 (quá 5 lần/giờ) → báo đếm ngược, khoá nút; hết chờ thì bấm lại được', async () => {
    jest.useFakeTimers();
    try {
      mockedCreate.mockRejectedValueOnce(httpError(429, 'RATE_002', 'Bạn thao tác quá nhanh', { retryAfterSeconds: 2 }));
      await openSheet();

      await fireEvent.press(await screen.findByRole('button', { name: 'Tạo báo cáo' }));

      expect(await screen.findByText('Bạn đã xuất quá nhiều lần. Thử lại sau 2 giây.')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Thử lại sau 2 giây' })).toBeDisabled();
      expect(onCreated).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(1_000);
      });
      expect(screen.getByRole('button', { name: 'Thử lại sau 1 giây' })).toBeDisabled();

      await act(async () => {
        jest.advanceTimersByTime(1_000);
      });
      expect(screen.getByRole('button', { name: 'Tạo báo cáo' })).toBeEnabled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('lỗi khác (mất mạng…) hiện TRONG tấm, tấm vẫn mở để thử lại', async () => {
    mockedCreate.mockRejectedValueOnce(httpError(503, 'FOO_999', 'Máy chủ đang bận'));
    await openSheet();

    await fireEvent.press(await screen.findByRole('button', { name: 'Tạo báo cáo' }));

    expect(await screen.findByText('Máy chủ đang bận')).toBeOnTheScreen();
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Tạo báo cáo' })).toBeEnabled();
  });
});
