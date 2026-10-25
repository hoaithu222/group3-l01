import { arrange, renderScreen, svc } from './ContributionScreen.harness';

import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useFeature } from '@/shell/capabilities';

import { BOARD, makeReport } from './fixtures';
import { httpError } from './harness';

/**
 * Màn "Đóng góp" — trạng thái tải / lỗi / stale / cờ phân hệ tắt, và xuất PDF. Khung dùng chung + mô tả: `ContributionScreen.harness.tsx` /
 * `ContributionScreen.test.tsx`.
 */
beforeEach(() => {
  jest.clearAllMocks();
  arrange();
});

describe('ContributionScreen — trạng thái tải / lỗi / stale', () => {
  it('lỗi tải báo cáo → "Không tải được bảng điểm" có "Thử lại"; bấm là tải lại thành công', async () => {
    svc.report.mockRejectedValueOnce(httpError(500, 'FOO_999', 'Máy chủ bận'));
    await renderScreen();

    expect(await screen.findByText('Không tải được bảng điểm')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }));

    expect(await screen.findByText('Nguyễn Văn A')).toBeOnTheScreen();
  });

  it('mất quyền (404) → giải thích, KHÔNG có "Thử lại" (thử lại vẫn 404)', async () => {
    svc.report.mockRejectedValue(httpError(404, 'PERM_404'));
    await renderScreen();

    expect(await screen.findByText('Không xem được báo cáo')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });

  it('cờ phân hệ project tắt → màn "chưa được bật", KHÔNG gọi API nào', async () => {
    (useFeature as jest.Mock).mockReturnValue(false);
    await renderScreen();

    expect(await screen.findByText('Tính năng này hiện chưa được bật')).toBeOnTheScreen();
    expect(svc.report).not.toHaveBeenCalled();
    expect(svc.periods).not.toHaveBeenCalled();
    expect(svc.heatmap).not.toHaveBeenCalled();
  });

  it('stale: banner "Đang cập nhật số liệu (tính lần cuối …)" và ĐÚNG MỘT lần tải lại sau 60 giây', async () => {
    jest.useFakeTimers();
    try {
      svc.report.mockResolvedValue(makeReport({ stale: true }));
      await renderScreen();

      expect(await screen.findByText('Đang cập nhật số liệu (tính lần cuối 10:32 15/09).')).toBeOnTheScreen();
      expect(svc.report).toHaveBeenCalledTimes(1);

      await act(async () => {
        jest.advanceTimersByTime(59_000);
      });
      expect(svc.report).toHaveBeenCalledTimes(1);
      await act(async () => {
        jest.advanceTimersByTime(1_000);
      });
      await waitFor(() => expect(svc.report).toHaveBeenCalledTimes(2));
      // Vẫn stale sau lần tải lại → KHÔNG hẹn tiếp (không đập server mỗi phút).
      await act(async () => {
        jest.advanceTimersByTime(300_000);
      });
      expect(svc.report).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('ContributionScreen — xuất PDF', () => {
  it('tạo báo cáo → ghi exportId vào URL (router.setParams) để theo dõi và để thông báo đưa người dùng quay lại', async () => {
    svc.createExport.mockResolvedValue({ exportId: 'e-1', status: 'QUEUED' });
    await renderScreen();
    await screen.findByText('60%');

    await fireEvent.press(screen.getByRole('button', { name: 'Xuất báo cáo PDF' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Tạo báo cáo' }));

    await waitFor(() => expect(router.setParams).toHaveBeenCalledWith({ exportId: 'e-1' }));
    expect(svc.createExport).toHaveBeenCalledWith(BOARD, { includeHeatmap: true, period: 'ALL' });
  });

  it('?exportId= (từ thông báo) → banner trạng thái lượt xuất, có "Mở PDF" khi READY', async () => {
    arrange({ params: { exportId: 'e-1' } });
    await renderScreen();

    expect(await screen.findByText('Báo cáo đã sẵn sàng')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Mở PDF' })).toBeOnTheScreen();
    expect(svc.getExport).toHaveBeenCalledWith('e-1');
  });

  it('đóng banner xuất → gỡ exportId khỏi URL', async () => {
    arrange({ params: { exportId: 'e-1' } });
    await renderScreen();
    await screen.findByText('Báo cáo đã sẵn sàng');

    await fireEvent.press(screen.getByRole('button', { name: 'Đóng thông báo' }));

    expect(router.setParams).toHaveBeenCalledWith({ exportId: undefined });
  });
});
