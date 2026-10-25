import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { showToast } from '@/shared/utils/toast.utils';

import { portfolioProjectService } from '../api/portfolio-project.service';
import { portfolioService } from '../api/portfolio.service';
import type { EligibleWorkspace } from '../api/portfolio.types';
import { PortfolioAddProjectScreen } from '../screens/portfolio/PortfolioAddProjectScreen';
import { makeOverview, makeProject } from './portfolio.fixtures';
import { apiError, networkError, renderPortfolio } from './portfolio.harness';

/**
 * app.md p6-07 §3, §4, §8 "Thêm dự án": nhãn Đã lưu trữ/Đã rời nhóm/Đã thêm, `Idempotency-Key` sinh MỘT lần cho mỗi nhóm và GIỮ khi thử lại sau lỗi mạng (BE chỉ làm một lượt) nhưng ĐỔI sau 4xx
 * (BE lưu cả câu 4xx theo khoá), lỗi PORT_004/005/006 hiện TRONG màn bằng tiếng Việt, hết chỗ ⇒ khoá hàng.
 */
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('@/shell/capabilities', () => ({
  useCapabilities: () => ({ data: undefined }),
  useFeature: () => true,
}));

const eligible = jest.spyOn(portfolioProjectService, 'eligible');
const add = jest.spyOn(portfolioProjectService, 'add');
const overview = jest.spyOn(portfolioService, 'overview');

const ws = (over: Partial<EligibleWorkspace>): EligibleWorkspace => ({
  alreadyAdded: false,
  archived: false,
  left: false,
  myTasksDone: 12,
  name: 'Nhóm Alpha',
  workspaceId: 'ws-1',
  ...over,
});
const keyOf = (call: number) => add.mock.calls[call]![1];

beforeEach(() => {
  jest.clearAllMocks();
  overview.mockResolvedValue(makeOverview({ projects: [] }));
  eligible.mockResolvedValue({ items: [ws({})], nextCursor: null });
});

describe('PortfolioAddProjectScreen', () => {
  it('hiện tên nhóm, "12 task của bạn" và nhãn chữ Đã lưu trữ / Đã rời nhóm / Đã thêm (nhóm đã thêm bị khoá)', async () => {
    eligible.mockResolvedValue({
      items: [
        ws({}),
        ws({ archived: true, left: true, name: 'Nhóm Beta', workspaceId: 'ws-2' }),
        ws({ alreadyAdded: true, name: 'Nhóm Gamma', workspaceId: 'ws-3' }),
      ],
      nextCursor: null,
    });
    await renderPortfolio(<PortfolioAddProjectScreen />);
    expect(await screen.findByText('Nhóm Alpha')).toBeOnTheScreen();
    expect(screen.getAllByText('12 task của bạn')).toHaveLength(3);
    expect(screen.getByText('Đã lưu trữ')).toBeOnTheScreen();
    expect(screen.getByText('Đã rời nhóm')).toBeOnTheScreen();
    expect(screen.getByText('Đã thêm')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Nhóm Gamma'));
    expect(add).not.toHaveBeenCalled();
  });

  it('chạm nhóm ⇒ POST kèm Idempotency-Key hợp lệ (8–128 ký tự); xong ⇒ toast + quay lại', async () => {
    add.mockResolvedValue(makeProject());
    await renderPortfolio(<PortfolioAddProjectScreen />);
    await fireEvent.press(await screen.findByText('Nhóm Alpha'));
    await waitFor(() => expect(add).toHaveBeenCalledWith('ws-1', expect.any(String)));
    expect(keyOf(0).length).toBeGreaterThanOrEqual(8);
    expect(keyOf(0).length).toBeLessThanOrEqual(128);
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(showToast).toHaveBeenCalledWith('success', 'Đã thêm dự án vào hồ sơ');
  });

  it('lỗi MẠNG ⇒ thử lại dùng CÙNG khoá; lỗi 4xx (PORT_006) ⇒ khoá ĐỔI ở lượt sau', async () => {
    add
      .mockRejectedValueOnce(networkError())
      .mockRejectedValueOnce(apiError(409, 'PORT_006'))
      .mockResolvedValue(makeProject());
    await renderPortfolio(<PortfolioAddProjectScreen />);
    await fireEvent.press(await screen.findByText('Nhóm Alpha'));
    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Nhóm Alpha')).toBeOnTheScreen());
    await fireEvent.press(screen.getByText('Nhóm Alpha'));
    await waitFor(() => expect(add).toHaveBeenCalledTimes(2));
    expect(keyOf(1)).toBe(keyOf(0));
    expect(await screen.findByText('Dự án này đã có trong hồ sơ.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Nhóm Alpha'));
    await waitFor(() => expect(add).toHaveBeenCalledTimes(3));
    expect(keyOf(2)).not.toBe(keyOf(1));
  });

  it.each([
    ['PORT_004', 404, 'Bạn chưa có task hoàn thành nào được ghi nhận trong nhóm này.'],
    ['PORT_005', 409, 'Hồ sơ đã đạt số dự án tối đa. Xoá bớt một dự án rồi thêm lại.'],
  ])(
    '%s ⇒ câu tiếng Việt TRONG màn (không toast), không quay lại',
    async (code, status, message) => {
      add.mockRejectedValue(apiError(status, code));
      await renderPortfolio(<PortfolioAddProjectScreen />);
      await fireEvent.press(await screen.findByText('Nhóm Alpha'));
      expect(await screen.findByText(message)).toBeOnTheScreen();
      expect(showToast).not.toHaveBeenCalled();
      expect(router.back).not.toHaveBeenCalled();
    },
  );

  it('đã đủ 12 dự án ⇒ cảnh báo + khoá mọi hàng', async () => {
    overview.mockResolvedValue(
      makeOverview({
        projects: Array.from({ length: 12 }, (_, i) =>
          makeProject({ id: `p${String(i)}`, workspaceId: `w${String(i)}` }),
        ),
      }),
    );
    await renderPortfolio(<PortfolioAddProjectScreen />);
    expect(await screen.findByText(/đạt tối đa 12 dự án/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Nhóm Alpha'));
    expect(add).not.toHaveBeenCalled();
  });

  it('rỗng ⇒ "chưa có task hoàn thành nào được ghi nhận", không có nút thêm', async () => {
    eligible.mockResolvedValue({ items: [], nextCursor: null });
    await renderPortfolio(<PortfolioAddProjectScreen />);
    expect(
      await screen.findByText('Bạn chưa có task hoàn thành nào được ghi nhận'),
    ).toBeOnTheScreen();
  });

  it('nhiều trang ⇒ "Xem thêm nhóm" gọi trang kế bằng cursor rồi ẩn nút khi hết', async () => {
    eligible
      .mockResolvedValueOnce({ items: [ws({})], nextCursor: 'c2' })
      .mockResolvedValueOnce({
        items: [ws({ name: 'Nhóm Delta', workspaceId: 'ws-9' })],
        nextCursor: null,
      });
    await renderPortfolio(<PortfolioAddProjectScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Xem thêm nhóm' }));
    expect(await screen.findByText('Nhóm Delta')).toBeOnTheScreen();
    expect(eligible).toHaveBeenLastCalledWith('c2');
    expect(screen.queryByRole('button', { name: 'Xem thêm nhóm' })).toBeNull();
  });
});
