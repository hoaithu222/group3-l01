import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { showToast } from '@/shared/utils/toast.utils';

import { portfolioProjectService } from '../api/portfolio-project.service';
import { portfolioService } from '../api/portfolio.service';
import { PortfolioHomeScreen } from '../screens/portfolio/PortfolioHomeScreen';
import { makeOverview, makePortfolio, makeProject } from './portfolio.fixtures';
import { apiError, mockSocket, networkError, renderPortfolio } from './portfolio.harness';

/**
 * app.md p6-07 §3, §8: màn Tổng quan — trạng thái thẻ, danh sách dự án (ẩn/hiện, lên/xuống LẠC QUAN + trả lại khi lỗi), rỗng, cờ tắt. Công khai/Ngừng công khai/socket ở `PortfolioPublish.test.tsx`.
 */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
}));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('@/shell/capabilities', () => ({
  ...jest.requireActual('@/shell/capabilities/FeatureOffScreen'),
  useCapabilities: () => ({ data: undefined }),
  useFeature: () => true,
}));

const overview = jest.spyOn(portfolioService, 'overview');
const reorder = jest.spyOn(portfolioProjectService, 'reorder');
const update = jest.spyOn(portfolioProjectService, 'update');

const A = makeProject({ id: 'a', order: 0, title: 'Dự án A', version: 2 });
const B = makeProject({ id: 'b', order: 1, title: 'Dự án B', workspaceId: 'ws-2' });

const titles = () =>
  screen.getAllByText(/^Dự án [AB]$/).map((node) => node.props.children as string);

beforeEach(() => jest.clearAllMocks());

describe('PortfolioHomeScreen', () => {
  it('hồ sơ nháp: thẻ trạng thái + đường dẫn DỰ KIẾN (không bấm được) + dự án kèm số liệu có đơn vị', async () => {
    overview.mockResolvedValue(makeOverview({ projects: [A] }));
    await renderPortfolio(<PortfolioHomeScreen />);
    expect(await screen.findByText('Bản nháp')).toBeOnTheScreen();
    expect(screen.getByText(/Đường dẫn dự kiến: .*\/an-dev/)).toBeOnTheScreen();
    expect(screen.getByText('40 task · 62 điểm')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Chia sẻ' })).toBeNull(); // chưa công khai ⇒ không có link để chia sẻ
    expect(screen.getByRole('button', { name: 'Công khai' })).toBeOnTheScreen();
  });

  it('chưa có hồ sơ/dự án: lời mời thêm dự án đầu tiên, không có thanh công khai, Giao diện/Xem trước bị khoá', async () => {
    overview.mockResolvedValue(makeOverview({ portfolio: null, projects: [] }));
    await renderPortfolio(<PortfolioHomeScreen />);
    expect(await screen.findByText('Chưa có dự án nào')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Thêm dự án đầu tiên' }));
    expect(router.push).toHaveBeenCalledWith('/me/career/portfolio/projects/add');
    expect(screen.queryByRole('button', { name: 'Công khai' })).toBeNull();
    expect(screen.getByRole('button', { name: /Giao diện/ })).toBeDisabled();
  });

  it('nút xuống đổi thứ tự NGAY (lạc quan) và gửi đúng thứ tự mới; nhãn nói rõ dự án nào', async () => {
    overview.mockResolvedValue(makeOverview({ projects: [A, B] }));
    reorder.mockResolvedValue([
      { ...B, order: 0 },
      { ...A, order: 1 },
    ]);
    await renderPortfolio(<PortfolioHomeScreen />);
    await screen.findByText('Dự án A');
    await fireEvent.press(screen.getByRole('button', { name: 'Chuyển Dự án A xuống' }));
    await waitFor(() => expect(reorder).toHaveBeenCalledWith(['b', 'a']));
    await waitFor(() => expect(titles()).toEqual(['Dự án B', 'Dự án A']));
    expect(screen.getByRole('button', { name: 'Chuyển Dự án B lên' })).toBeDisabled();
  });

  it('đổi thứ tự lỗi ⇒ TRẢ VỀ thứ tự cũ + toast tiếng Việt', async () => {
    overview.mockResolvedValue(makeOverview({ projects: [A, B] }));
    reorder.mockRejectedValue(apiError(500, 'SYS_500'));
    await renderPortfolio(<PortfolioHomeScreen />);
    await screen.findByText('Dự án A');
    await fireEvent.press(screen.getByRole('button', { name: 'Chuyển Dự án A xuống' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('error', expect.any(String)));
    await waitFor(() => expect(titles()).toEqual(['Dự án A', 'Dự án B']));
  });

  it('ẩn dự án ⇒ PATCH kèm expectedVersion CỦA DỰ ÁN; lỗi lệch phiên bản (RES_003) ⇒ trả về + toast + tải lại hồ sơ', async () => {
    overview.mockResolvedValue(makeOverview({ projects: [A] }));
    update.mockRejectedValue(apiError(409, 'RES_003'));
    await renderPortfolio(<PortfolioHomeScreen />);
    await fireEvent.press(await screen.findByRole('switch', { name: 'Hiện Dự án A trên trang' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('a', { expectedVersion: 2, visible: false }),
    );
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('vừa được thay đổi ở nơi khác'),
      ),
    );
    await waitFor(() => expect(overview.mock.calls.length).toBeGreaterThan(1));
    expect(screen.getByRole('switch', { name: 'Hiện Dự án A trên trang' })).toBeOnTheScreen();
  });

  it('cờ portfolio tắt ở server (404 CFG_005) ⇒ "Tính năng này hiện chưa được bật", không có Thử lại vô nghĩa', async () => {
    overview.mockRejectedValue(apiError(404, 'CFG_005'));
    await renderPortfolio(<PortfolioHomeScreen />);
    expect(await screen.findByText('Tính năng này hiện chưa được bật')).toBeOnTheScreen();
    expect(overview).toHaveBeenCalledTimes(1);
  });

  it('mất mạng ⇒ trạng thái ngoại tuyến + "Thử lại" tải lại được', async () => {
    overview
      .mockRejectedValueOnce(networkError())
      .mockRejectedValueOnce(networkError())
      .mockRejectedValueOnce(networkError());
    overview.mockResolvedValue(makeOverview({ projects: [A] }));
    await renderPortfolio(<PortfolioHomeScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Dự án A')).toBeOnTheScreen();
  });

  it('bị gỡ vi phạm ⇒ không có thanh công khai, câu PORT_008', async () => {
    overview.mockResolvedValue(
      makeOverview({ portfolio: makePortfolio({ status: 'UNPUBLISHED', takenDown: true }) }),
    );
    await renderPortfolio(<PortfolioHomeScreen />);
    expect(
      await screen.findByText('Hồ sơ đã bị gỡ do vi phạm. Liên hệ hỗ trợ để được xem xét.'),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Công khai' })).toBeNull();
  });

  it('socket NỐI LẠI ⇒ tải lại hồ sơ (sự kiện portfolio:build-updated trong lúc mất kết nối là mất hẳn)', async () => {
    overview.mockResolvedValue(makeOverview());
    await renderPortfolio(<PortfolioHomeScreen />);
    await screen.findByText('Bản nháp');
    const before = overview.mock.calls.length;
    await act(async () => {
      mockSocket.__emitServer('connect');
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    await waitFor(() => expect(overview.mock.calls.length).toBeGreaterThan(before));
  });
});
