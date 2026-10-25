import { arrange, MEMBER, OWNER, renderScreen, svc } from './ContributionScreen.harness';

import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { BOARD, makeReport, USER_A } from './fixtures';

/**
 * Màn "Đóng góp" (p4-06 app.md §3, §8): công thức + bảng điểm kèm số gốc + biểu đồ hoạt động + xuất PDF; CHỈ ĐỌC với mọi vai trò (nút "Đổi trọng số" chỉ OWNER/ADMIN, bảng
 * chưa lưu trữ, đang online); kỳ/thành viên biểu đồ/lượt xuất nằm trên URL. Mock ở tầng service + route (không mạng) — khung dùng chung ở `ContributionScreen.harness.tsx`.
 *
 * Tách theo nhóm cho mỗi file ≤ 200 dòng: file này = nội dung + quyền đổi trọng số; `ContributionScreen.members.test.tsx` = chi tiết thành viên;
 * `ContributionScreen.states.test.tsx` = tải/lỗi/stale + xuất PDF.
 */
beforeEach(() => {
  jest.clearAllMocks();
  arrange();
});

describe('ContributionScreen — nội dung', () => {
  it('AppBar, kỳ, công thức, bảng điểm KÈM SỐ GỐC và biểu đồ hoạt động; mở màn gọi báo cáo(ALL) + kỳ + biểu đồ', async () => {
    await renderScreen();

    expect(await screen.findByText('Đóng góp')).toBeOnTheScreen();
    expect(await screen.findByText('Đồ án cuối kỳ')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Toàn bộ' })).toBeOnTheScreen();
    // Công thức + định nghĩa server.
    expect(await screen.findByText('60%')).toBeOnTheScreen();
    expect(screen.getByText('Tỷ lệ thẻ hoàn thành đúng hạn trên thẻ có hạn.')).toBeOnTheScreen();
    // Hai thành viên, mỗi người có số gốc cạnh %.
    expect(screen.getByText('Nguyễn Văn A')).toBeOnTheScreen();
    expect(screen.getByText('3/4 đúng hạn · 75%')).toBeOnTheScreen();
    expect(screen.getByText('Trần Thị B')).toBeOnTheScreen();
    expect(screen.getByText('Điểm thẻ so với người nhiều nhất nhóm (8 điểm).')).toBeOnTheScreen();
    // Biểu đồ hoạt động: tóm tắt chữ.
    expect(await screen.findByText('2 ngày có hoạt động trong 26 tuần, nhiều nhất 15/09 (7)')).toBeOnTheScreen();

    expect(svc.report).toHaveBeenCalledWith(BOARD, 'ALL');
    expect(svc.periods).toHaveBeenCalledWith(BOARD);
    expect(svc.heatmap).toHaveBeenCalledWith(BOARD, { from: '2026-03-23', to: '2026-09-15', userId: undefined });
    // Bảng chỉ đọc: không nút sửa điểm/% nào.
    expect(screen.queryByText(/Sửa điểm|Chỉnh điểm/)).toBeNull();
  });

  it('kỳ trên URL (?period=M:2026-09) được dùng để gọi báo cáo và hiện tên kỳ trên chip', async () => {
    arrange({ params: { period: 'M:2026-09' } });
    await renderScreen();

    expect(await screen.findByRole('radio', { name: 'Tháng 9/2026' })).toBeOnTheScreen();
    expect(svc.report).toHaveBeenCalledWith(BOARD, 'M:2026-09');
  });

  it('?period= sai dạng (deep link không đáng tin) → rơi về "Toàn bộ", không gọi API với giá trị lạ', async () => {
    arrange({ params: { period: 'M:2026-99' } });
    await renderScreen();

    await screen.findByText('60%');
    expect(svc.report).toHaveBeenCalledWith(BOARD, 'ALL');
    expect(svc.report).not.toHaveBeenCalledWith(BOARD, 'M:2026-99');
  });

  it('chọn một tháng ở bộ chọn kỳ → ghi kỳ vào URL (router.setParams)', async () => {
    await renderScreen();
    await screen.findByText('60%');

    await fireEvent.press(screen.getByRole('radio', { name: 'Tháng' }));
    await fireEvent.press(await screen.findByText('Tháng 8/2026'));

    expect(router.setParams).toHaveBeenCalledWith({ period: 'M:2026-08' });
  });

  it('?heat=<userId> → biểu đồ của thành viên đó (gọi API kèm userId); id sai dạng → cả bảng', async () => {
    arrange({ params: { heat: USER_A } });
    await renderScreen();
    await waitFor(() => expect(svc.heatmap).toHaveBeenCalledWith(BOARD, { from: '2026-03-23', to: '2026-09-15', userId: USER_A }));
  });

  it('kỳ chưa có thẻ hoàn thành → "Kỳ này chưa có thẻ hoàn thành"', async () => {
    svc.report.mockResolvedValue(makeReport({ members: [], maxStoryPoints: 0 }));
    await renderScreen();

    expect(await screen.findByText('Kỳ này chưa có thẻ hoàn thành')).toBeOnTheScreen();
  });
});

describe('ContributionScreen — quyền đổi trọng số', () => {
  it('MEMBER KHÔNG thấy "Đổi trọng số"', async () => {
    arrange({ permissions: MEMBER });
    await renderScreen();
    await screen.findByText('60%');

    expect(screen.queryByRole('button', { name: 'Đổi trọng số' })).toBeNull();
  });

  it('OWNER/ADMIN (workspace.board.edit) thấy "Đổi trọng số"; bấm mở tấm và tải công thức', async () => {
    arrange({ permissions: OWNER });
    await renderScreen();

    await fireEvent.press(await screen.findByRole('button', { name: 'Đổi trọng số' }));

    expect(await screen.findByLabelText('Điểm thẻ (%)')).toBeOnTheScreen();
    expect(svc.config).toHaveBeenCalledWith(BOARD);
  });

  it('bảng đã lưu trữ → chỉ xem: nút ẩn dù có quyền, và có banner nói rõ', async () => {
    arrange({ archivedAt: '2026-09-01T00:00:00.000Z', permissions: OWNER });
    await renderScreen();

    expect(await screen.findByText('Bảng đã lưu trữ — chỉ xem, không đổi trọng số được.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Đổi trọng số' })).toBeNull();
  });

  it('offline → chỉ xem: banner "Dữ liệu lúc …", nút xuất PDF khoá, không "Đổi trọng số"', async () => {
    arrange({ offline: true, permissions: OWNER });
    await renderScreen();

    expect(await screen.findByText(/Không có kết nối — chỉ xem.*Dữ liệu lúc 10:32 15\/09\./)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Xuất báo cáo PDF' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Đổi trọng số' })).toBeNull();
  });
});
