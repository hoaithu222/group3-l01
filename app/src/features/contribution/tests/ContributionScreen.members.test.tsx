import { arrange, renderScreen, svc, TABLET, TABLET_LG } from './ContributionScreen.harness';

import { fireEvent, screen } from '@testing-library/react-native';

import { BOARD, makeMember, makePointsOnlyMember, makeReport, USER_A } from './fixtures';

/**
 * Màn "Đóng góp" — chi tiết thành viên theo cỡ màn (điện thoại: tấm; tablet dọc: bảng 8 cột + tấm; tablet ngang ≥ 840dp: panel bên phải) và
 * người đã rời nhóm. Khung dùng chung + mô tả: `ContributionScreen.harness.tsx` / `ContributionScreen.test.tsx`.
 */
beforeEach(() => {
  jest.clearAllMocks();
  arrange();
});

describe('ContributionScreen — chi tiết thành viên', () => {
  it('điện thoại: chạm một hàng mở tấm chi tiết (công thức áp số + thẻ được tính)', async () => {
    await renderScreen();

    await fireEvent.press(await screen.findByText('Nguyễn Văn A'));

    expect(await screen.findByText('Công thức áp số')).toBeOnTheScreen();
    expect(screen.getByText('60 × 8/8 + 20 × 3/4 + 20 × 8,0/10 = 91,0')).toBeOnTheScreen();
    expect(svc.memberTasks).toHaveBeenCalledWith(BOARD, USER_A, 'ALL', undefined);
  });

  it('máy tính bảng dọc: bảng 8 cột, chạm hàng mở tấm (không đủ chỗ cho panel)', async () => {
    arrange({ breakpoint: TABLET });
    await renderScreen();

    expect(await screen.findByText('Thẻ xong')).toBeOnTheScreen();
    expect(screen.queryByText('Chọn một thành viên để xem số gốc và các thẻ được tính.')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: /Nguyễn Văn A, 91,0 điểm/ }));

    expect(await screen.findByText('Công thức áp số')).toBeOnTheScreen();
  });

  it('máy tính bảng ngang (≥ 840dp): panel chi tiết nằm bên phải, chọn hàng thì panel hiện nội dung tại chỗ', async () => {
    arrange({ breakpoint: TABLET_LG });
    await renderScreen();

    expect(await screen.findByText('Chọn một thành viên để xem số gốc và các thẻ được tính.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: /Nguyễn Văn A, 91,0 điểm/ }));

    expect(await screen.findByText('Công thức áp số')).toBeOnTheScreen();
    expect(screen.queryByText('Chọn một thành viên để xem số gốc và các thẻ được tính.')).toBeNull();
    // Máy tính bảng dùng lưới 52 tuần.
    expect(svc.heatmap).toHaveBeenCalledWith(BOARD, { from: '2025-09-22', to: '2026-09-15', userId: undefined });
  });
});

describe('ContributionScreen — người đã rời nhóm', () => {
  it('vẫn hiện trong kỳ họ có đóng góp, kèm nhãn "Đã rời nhóm"', async () => {
    svc.report.mockResolvedValue(
      makeReport({
        members: [makeMember(), makePointsOnlyMember({ user: { avatarUrl: null, id: 'u9', membership: 'LEFT', name: 'Lê Văn C' } })],
      }),
    );
    await renderScreen();

    expect(await screen.findByText('Lê Văn C')).toBeOnTheScreen();
    expect(screen.getByText('Đã rời nhóm')).toBeOnTheScreen();
  });
});
