import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { showToast } from '@/shared/utils/toast.utils';

import { contributionService } from '../api/contribution.service';
import { ExportStatusBanner } from '../components/ExportStatusBanner';
import { BOARD, makeExport, TZ } from './fixtures';
import { httpError, renderWithClient } from './harness';

/**
 * Trạng thái lượt xuất PDF (app.md §3, §8): QUEUED → "Đang tạo", READY → "Mở PDF" xin URL MỚI ngay lúc bấm rồi mở, `CONTRIB_005` → "Xuất lại",
 * FAILED → "Thử lại" tạo lượt mới. Mock ở tầng service (không mạng).
 */
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/contribution.service', () => ({
  ...jest.requireActual('../api/contribution.service'),
  contributionService: { createExport: jest.fn(), exportDownloadUrl: jest.fn(), getExport: jest.fn() },
}));

const mockedGet = contributionService.getExport as jest.Mock;
const mockedUrl = contributionService.exportDownloadUrl as jest.Mock;
const mockedCreate = contributionService.createExport as jest.Mock;
const openURL = jest.spyOn(Linking, 'openURL');
const onDismiss = jest.fn();
const onReplace = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  openURL.mockResolvedValue(true);
  mockedCreate.mockResolvedValue({ exportId: 'e-2', status: 'QUEUED' });
});

const renderBanner = () =>
  renderWithClient(
    <ExportStatusBanner boardId={BOARD} exportId="e-1" period="M:2026-09" timezone={TZ} onDismiss={onDismiss} onReplace={onReplace} />,
  );

describe('ExportStatusBanner', () => {
  it('QUEUED/RUNNING → "Đang tạo báo cáo…" kèm kỳ, chưa có nút Mở PDF', async () => {
    mockedGet.mockResolvedValue(makeExport({ status: 'QUEUED' }));
    await renderBanner();

    expect(await screen.findByText('Đang tạo báo cáo…')).toBeOnTheScreen();
    expect(screen.getByText(/Kỳ Toàn bộ/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Mở PDF' })).toBeNull();
  });

  it('READY → "Báo cáo đã sẵn sàng", mã xác thực và hạn; "Mở PDF" xin URL MỚI ngay lúc bấm rồi mở bằng Linking', async () => {
    mockedGet.mockResolvedValue(makeExport({ status: 'READY' }));
    mockedUrl.mockResolvedValue('https://files.example/report.pdf?sig=abc');
    await renderBanner();

    expect(await screen.findByText('Báo cáo đã sẵn sàng')).toBeOnTheScreen();
    expect(screen.getByText(/Mã xác thực ABCD123456/)).toBeOnTheScreen();
    expect(screen.getByText(/Hết hạn 15\/10\/2026/)).toBeOnTheScreen();
    // URL KHÔNG được xin trước — ký ≤ 60 giây, cấp NGAY lúc bấm.
    expect(mockedUrl).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Mở PDF' }));

    await waitFor(() => expect(openURL).toHaveBeenCalledWith('https://files.example/report.pdf?sig=abc'));
    expect(mockedUrl).toHaveBeenCalledTimes(1);
    expect(mockedUrl).toHaveBeenCalledWith('e-1');
  });

  it('bấm "Mở PDF" hai lần liên tiếp chỉ xin URL một lần (nút khoá lúc đang xin)', async () => {
    mockedGet.mockResolvedValue(makeExport());
    let resolveUrl: (url: string) => void = () => undefined;
    mockedUrl.mockReturnValue(new Promise<string>((resolve) => (resolveUrl = resolve)));
    await renderBanner();
    await screen.findByText('Báo cáo đã sẵn sàng');

    await fireEvent.press(screen.getByRole('button', { name: 'Mở PDF' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Mở PDF' }));
    await act(async () => resolveUrl('https://files.example/a.pdf'));

    await waitFor(() => expect(openURL).toHaveBeenCalledTimes(1));
    expect(mockedUrl).toHaveBeenCalledTimes(1);
  });

  it('mở PDF lúc tệp vừa hết hạn (410 CONTRIB_005) → toast + banner đổi sang "Xuất lại"', async () => {
    mockedGet.mockResolvedValueOnce(makeExport()).mockRejectedValue(httpError(410, 'CONTRIB_005'));
    mockedUrl.mockRejectedValue(httpError(410, 'CONTRIB_005'));
    await renderBanner();
    await screen.findByText('Báo cáo đã sẵn sàng');

    await fireEvent.press(screen.getByRole('button', { name: 'Mở PDF' }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('error', 'Tệp báo cáo đã hết hạn, hãy xuất lại.'));
    expect(await screen.findByText('Tệp đã hết hạn')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Xuất lại' })).toBeOnTheScreen();
    expect(openURL).not.toHaveBeenCalled();
  });

  it('hết hạn ngay từ lần tải đầu (410): "Xuất lại" dùng kỳ đang xem, kèm heatmap, rồi báo lượt mới cho màn', async () => {
    mockedGet.mockRejectedValue(httpError(410, 'CONTRIB_005'));
    await renderBanner();

    await fireEvent.press(await screen.findByRole('button', { name: 'Xuất lại' }));

    await waitFor(() => expect(onReplace).toHaveBeenCalledWith('e-2'));
    expect(mockedCreate).toHaveBeenCalledWith(BOARD, { includeHeatmap: true, period: 'M:2026-09' });
  });

  it('EXPIRED (server đã đánh dấu) → "Tệp đã hết hạn" + "Xuất lại"', async () => {
    mockedGet.mockResolvedValue(makeExport({ status: 'EXPIRED' }));
    await renderBanner();

    expect(await screen.findByText('Tệp đã hết hạn')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Xuất lại' })).toBeOnTheScreen();
  });

  it('FAILED → "Không tạo được báo cáo" + "Thử lại": tạo lượt MỚI đúng kỳ/tuỳ chọn của lượt lỗi', async () => {
    mockedGet.mockResolvedValue(makeExport({ includeHeatmap: false, periodKey: 'W:2026-W37', status: 'FAILED' }));
    await renderBanner();

    expect(await screen.findByText('Không tạo được báo cáo')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }));

    await waitFor(() => expect(onReplace).toHaveBeenCalledWith('e-2'));
    expect(mockedCreate).toHaveBeenCalledWith(BOARD, { includeHeatmap: false, period: 'W:2026-W37' });
  });

  it('không xem được lượt xuất (404: người ngoài/đã xoá) → giải thích, KHÔNG có "Thử lại"', async () => {
    mockedGet.mockRejectedValue(httpError(404, 'PERM_404'));
    await renderBanner();

    expect(await screen.findByText('Không mở được báo cáo')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });

  it('lỗi tạm thời (5xx) → có "Thử lại" tải lại trạng thái', async () => {
    mockedGet.mockRejectedValueOnce(httpError(500, 'SYS_500')).mockResolvedValue(makeExport());
    await renderBanner();

    await fireEvent.press(await screen.findByRole('button', { name: 'Thử lại' }));

    expect(await screen.findByText('Báo cáo đã sẵn sàng')).toBeOnTheScreen();
  });
});
