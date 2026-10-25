import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { useBreakpoint } from '@/shared/theme';

import { portfolioProjectService } from '../api/portfolio-project.service';
import { portfolioService } from '../api/portfolio.service';
import { PortfolioHomeScreen } from '../screens/portfolio/PortfolioHomeScreen';
import { loadWebViewModule } from '../utils/load-webview-module';
import { makeOverview, makeProject } from './portfolio.fixtures';
import { renderPortfolio } from './portfolio.harness';

/**
 * app.md p6-07 §7: "Tablet: Tổng quan và Xem trước chia 2 cột (danh sách trái, preview phải)". Chỉ ở `tablet-lg` (≥ 840dp) VÀ khi đã có hồ sơ; điện thoại/máy tính bảng hẹp giữ một cột và không nạp
 * WebView (rẽ nhánh nội dung bằng `useBreakpoint`, không che bằng class). Khung xem trước nạp lại mỗi khi hồ sơ/dự án đổi (`previewRevision`).
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
jest.mock('@/shared/theme', () => ({
  ...jest.requireActual('@/shared/theme'),
  useBreakpoint: jest.fn(),
}));
jest.mock('@/core/api/session', () => ({
  ...jest.requireActual('@/core/api/session'),
  getAccessToken: () => 'token-abc',
}));
jest.mock('@/core/api/session.fresh', () => ({ ensureFreshAccessToken: jest.fn() }));
jest.mock('../utils/load-webview-module', () => ({ loadWebViewModule: jest.fn() }));
jest.mock('../queries/career.queries', () => ({
  useMyCareer: () => ({ data: undefined }),
  useMySkills: () => ({ data: [] }),
}));

const overview = jest.spyOn(portfolioService, 'overview');
const update = jest.spyOn(portfolioProjectService, 'update');
const { ensureFreshAccessToken } = jest.requireMock<{ ensureFreshAccessToken: jest.Mock }>(
  '@/core/api/session.fresh',
);

const bp = (tier: 'phone' | 'tablet' | 'tablet-lg') => ({
  height: 800,
  isLandscape: tier !== 'phone',
  isTablet: tier !== 'phone',
  tier,
  width: tier === 'tablet-lg' ? 1000 : tier === 'tablet' ? 700 : 390,
});

beforeEach(() => {
  jest.clearAllMocks();
  (useBreakpoint as jest.Mock).mockReturnValue(bp('tablet-lg'));
  ensureFreshAccessToken.mockResolvedValue(true);
  (loadWebViewModule as jest.Mock).mockResolvedValue(jest.requireMock('react-native-webview'));
  overview.mockResolvedValue(
    makeOverview({ projects: [makeProject({ id: 'a', title: 'Dự án A' })] }),
  );
});

describe('PortfolioHomeScreen — máy tính bảng rộng', () => {
  it('tablet-lg có hồ sơ ⇒ danh sách bên trái + WebView xem trước bên phải; bỏ hàng "Xem trước" thừa', async () => {
    await renderPortfolio(<PortfolioHomeScreen />);
    expect(await screen.findByText('Dự án A')).toBeOnTheScreen();
    expect(await screen.findByTestId('webview')).toBeOnTheScreen();
    expect(screen.getByTestId('webview').props.source).toMatchObject({
      headers: { Authorization: 'Bearer token-abc' },
      uri: expect.stringMatching(/\/me\/portfolio\/preview$/),
    });
    expect(screen.getByRole('button', { name: /Thông tin hồ sơ/ })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Xem trước/ })).toBeNull();
  });

  it.each([['phone'], ['tablet']] as const)(
    '%s ⇒ MỘT cột, KHÔNG nạp WebView, có hàng "Xem trước"',
    async (tier) => {
      (useBreakpoint as jest.Mock).mockReturnValue(bp(tier));
      await renderPortfolio(<PortfolioHomeScreen />);
      expect(await screen.findByText('Dự án A')).toBeOnTheScreen();
      expect(screen.queryByTestId('webview')).toBeNull();
      expect(loadWebViewModule).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: /^Xem trước/ })).toBeOnTheScreen();
    },
  );

  it('tablet-lg nhưng CHƯA có hồ sơ ⇒ vẫn một cột (không có gì để xem trước)', async () => {
    overview.mockResolvedValue(makeOverview({ portfolio: null, projects: [] }));
    await renderPortfolio(<PortfolioHomeScreen />);
    expect(await screen.findByText('Chưa có dự án nào')).toBeOnTheScreen();
    expect(screen.queryByTestId('webview')).toBeNull();
  });

  it('đổi dự án (ẩn/hiện) ⇒ khung xem trước NẠP LẠI kèm token mới; không đổi gì thì không nạp thêm', async () => {
    const A = makeProject({ id: 'a', title: 'Dự án A', version: 2 });
    overview.mockResolvedValue(makeOverview({ projects: [A] }));
    update.mockResolvedValue({ ...A, version: 3, visible: false });
    await renderPortfolio(<PortfolioHomeScreen />);
    await screen.findByTestId('webview');
    expect(ensureFreshAccessToken).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('switch', { name: 'Hiện Dự án A trên trang' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('a', { expectedVersion: 2, visible: false }),
    );
    await waitFor(() => expect(ensureFreshAccessToken.mock.calls.length).toBeGreaterThan(1));
    expect(await screen.findByTestId('webview')).toBeOnTheScreen();
  });

  it('hai cột: checklist công khai coi như ĐÃ xem trước (khung xem trước đang nằm ngay đó)', async () => {
    await renderPortfolio(<PortfolioHomeScreen />);
    await screen.findByTestId('webview');
    await fireEvent.press(screen.getByRole('button', { name: 'Công khai' }));
    expect(
      await screen.findByLabelText('Đã xem trước trang (khuyến nghị): đã đạt'),
    ).toBeOnTheScreen();
  });
});
