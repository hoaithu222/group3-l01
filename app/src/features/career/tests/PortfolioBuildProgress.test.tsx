import { act, fireEvent, screen } from '@testing-library/react-native';
import { Share } from 'react-native';

import { SocketEvent } from '@/core/socket';
import { showToast } from '@/shared/utils/toast.utils';

import { portfolioService } from '../api/portfolio.service';
import { PortfolioHomeScreen } from '../screens/portfolio/PortfolioHomeScreen';
import { makeBuild, makeOverview, makePortfolio } from './portfolio.fixtures';
import { mockSocket, renderPortfolio } from './portfolio.harness';

/**
 * app.md p6-07 §4, §8: socket `portfolio:build-updated` cập nhật thẻ trạng thái + hiện nút Chia sẻ (READY), FAILED ⇒ Alert + Thử lại, poll `builds/latest` khi socket không báo
 * (5 s khi mất socket — ở đây rút còn 30 ms bằng cách mock hằng số).
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
jest.mock('../constants/portfolio.constants', () => ({
  ...jest.requireActual('../constants/portfolio.constants'),
  BUILD_POLL_CONNECTED_MS: 30,
  BUILD_POLL_MS: 30,
}));
jest.mock('../queries/career.queries', () => ({
  useMyCareer: () => ({ data: undefined }),
  useMySkills: () => ({ data: [] }),
}));

const overview = jest.spyOn(portfolioService, 'overview');
const latestBuild = jest.spyOn(portfolioService, 'latestBuild');
const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });

const URL_PUBLIC = 'https://superapp.vcijsc.com/p/an-dev';
const PUBLISHED = makeOverview({
  portfolio: makePortfolio({ status: 'PUBLISHED' }),
  publicUrl: URL_PUBLIC,
});

const emit = (payload: object) =>
  act(async () => {
    mockSocket.__emitServer(SocketEvent.PORTFOLIO_BUILD_UPDATED, {
      buildId: 'bd-1',
      buildVersion: 1,
      portfolioId: 'pf-1',
      v: 1,
      ...payload,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

beforeEach(() => {
  jest.clearAllMocks();
  overview.mockResolvedValue(makeOverview());
});

describe('tiến độ dựng trang (socket + poll)', () => {
  it('READY ⇒ làm mới hồ sơ, thẻ "Đã công khai" + link + nút Chia sẻ, toast; Chia sẻ mở hộp chia sẻ với link', async () => {
    overview
      .mockResolvedValueOnce(makeOverview({ latestBuild: makeBuild({ status: 'QUEUED' }) }))
      .mockResolvedValue({ ...PUBLISHED, latestBuild: makeBuild({ status: 'READY' }) });
    await renderPortfolio(<PortfolioHomeScreen />);
    expect(await screen.findByText('Đang xếp hàng tạo trang…')).toBeOnTheScreen();
    await emit({ status: 'BUILDING' });
    expect((await screen.findAllByText('Đang tạo trang…')).length).toBeGreaterThan(1); // huy hiệu ở thẻ trạng thái + nhãn nút khoá ở thanh đáy
    await emit({ status: 'READY', url: URL_PUBLIC });
    expect(await screen.findByText(URL_PUBLIC)).toBeOnTheScreen();
    expect(screen.getByText('Đã công khai')).toBeOnTheScreen();
    expect(showToast).toHaveBeenCalledWith('success', 'Đã công khai hồ sơ');
    await fireEvent.press(screen.getByRole('button', { name: 'Chia sẻ' }));
    expect(share).toHaveBeenCalledWith({ message: expect.stringContaining(URL_PUBLIC) });
  });
  it('FAILED ⇒ Alert với câu của BE + "Thử lại" mở lại tấm công khai; toast báo một lần', async () => {
    overview
      .mockResolvedValueOnce(makeOverview({ latestBuild: makeBuild({ status: 'BUILDING' }) }))
      .mockResolvedValue(
        makeOverview({
          latestBuild: makeBuild({
            error: 'Quá thời gian tạo trang, vui lòng thử lại',
            status: 'FAILED',
          }),
        }),
      );
    await renderPortfolio(<PortfolioHomeScreen />);
    await screen.findAllByText('Đang tạo trang…');
    await emit({ error: 'Quá thời gian tạo trang, vui lòng thử lại', status: 'FAILED' });
    expect(await screen.findByText('Tạo trang chưa thành công')).toBeOnTheScreen();
    expect(screen.getByText(/Quá thời gian tạo trang/)).toBeOnTheScreen();
    expect(showToast).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Công khai hồ sơ')).toBeOnTheScreen();
  });

  it('socket im lặng ⇒ poll `builds/latest` thay cho sự kiện, không toast đôi', async () => {
    overview
      .mockResolvedValueOnce(makeOverview({ latestBuild: makeBuild({ status: 'QUEUED' }) }))
      .mockResolvedValue({ ...PUBLISHED, latestBuild: makeBuild({ status: 'READY' }) });
    latestBuild.mockResolvedValue(makeBuild({ status: 'READY' }));
    await renderPortfolio(<PortfolioHomeScreen />);
    expect(await screen.findByText(URL_PUBLIC, {}, { timeout: 3000 })).toBeOnTheScreen();
    expect(latestBuild).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledTimes(1);
  });
});
