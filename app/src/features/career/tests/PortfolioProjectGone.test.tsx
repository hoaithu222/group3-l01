import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { showToast } from '@/shared/utils/toast.utils';

import { portfolioProjectService } from '../api/portfolio-project.service';
import { PortfolioProjectEditor } from '../components/portfolio/PortfolioProjectEditor';
import { PortfolioProjectResolver } from '../components/portfolio/PortfolioProjectResolver';
import { makeProject } from './portfolio.fixtures';
import { apiError, renderPortfolio } from './portfolio.harness';

/**
 * app.md p6-07 §3 "Sửa dự án", cột "Mất quyền": 404 ⇒ "quay lại + toast 'Dự án không còn'". Ba đường tới 404 — mở màn khi dự án đã biến mất khỏi hồ sơ, LƯU và LÀM MỚI số liệu khi server báo không
 * còn — cùng một hành vi; không có lối lùi (mở thẳng bằng liên kết) thì về Tổng quan. Xoá dự án VỪA XOÁ XONG ở màn này không được toast nhầm (xem ca cuối).
 */
const mockCanGoBack = jest.fn(() => true);
jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    canGoBack: () => mockCanGoBack(),
    push: jest.fn(),
    replace: jest.fn(),
  },
}));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('@/shell/capabilities', () => ({
  useCapabilities: () => ({ data: undefined }),
  useFeature: () => true,
}));
// `useAssetUrl` đặt `gcTime: 60_000`: bộ đếm thu gom 60 giây giữ Jest sống thêm một phút sau khi tháo màn.
jest.mock('@/core/uploads/use-asset-url', () => ({ useAssetUrl: () => ({ data: undefined }) }));

const update = jest.spyOn(portfolioProjectService, 'update');
const refresh = jest.spyOn(portfolioProjectService, 'refresh');
const remove = jest.spyOn(portfolioProjectService, 'remove');

const PROJECT = makeProject({ id: 'pj-9', title: 'Dự án X', version: 4 });
const reload = jest.fn();
const GONE = () => apiError(404, 'RES_001');

beforeEach(() => {
  jest.clearAllMocks();
  mockCanGoBack.mockReturnValue(true);
});

describe('dự án không còn — mở màn', () => {
  it('không có trong hồ sơ ⇒ toast + lùi lại; trong lúc đó vẫn vẽ trạng thái "Dự án không còn"', async () => {
    await renderPortfolio(
      <PortfolioProjectResolver projectId="khong-co" projects={[PROJECT]} reload={reload} />,
    );
    expect(screen.getByText('Dự án không còn')).toBeOnTheScreen();
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('error', 'Dự án không còn');
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('mở thẳng bằng liên kết (không có gì để lùi) ⇒ về Tổng quan portfolio, không `back` vô tác dụng', async () => {
    mockCanGoBack.mockReturnValue(false);
    await renderPortfolio(
      <PortfolioProjectResolver projectId="khong-co" projects={[]} reload={reload} />,
    );
    expect(router.replace).toHaveBeenCalledWith('/me/career/portfolio');
    expect(router.back).not.toHaveBeenCalled();
  });

  it('có trong hồ sơ ⇒ mở form sửa, KHÔNG toast, không điều hướng', async () => {
    await renderPortfolio(
      <PortfolioProjectResolver projectId="pj-9" projects={[PROJECT]} reload={reload} />,
    );
    expect(screen.getByDisplayValue('Dự án X')).toBeOnTheScreen();
    expect(showToast).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('dự án biến mất khi đang mở (vừa xoá xong ở chính màn này) ⇒ GIỮ bản cuối, không toast nhầm', async () => {
    const view = await renderPortfolio(
      <PortfolioProjectResolver projectId="pj-9" projects={[PROJECT]} reload={reload} />,
    );
    await view.screen.rerender(
      <PortfolioProjectResolver projectId="pj-9" projects={[]} reload={reload} />,
    );
    expect(screen.getByDisplayValue('Dự án X')).toBeOnTheScreen();
    expect(showToast).not.toHaveBeenCalled();
  });
});

describe('dự án không còn — server báo 404', () => {
  const render = () =>
    renderPortfolio(<PortfolioProjectEditor project={PROJECT} reload={reload} />);

  it('LƯU bị 404 ⇒ toast "Dự án không còn" + lùi lại, KHÔNG hiện lỗi trong form', async () => {
    update.mockRejectedValue(GONE());
    await render();
    await fireEvent.press(screen.getByRole('button', { name: 'Lưu dự án' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('error', 'Dự án không còn'));
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/vừa được thay đổi/)).toBeNull();
  });

  it('LÀM MỚI số liệu bị 404 ⇒ cũng toast + lùi lại (không đếm ngược, không toast lỗi chung)', async () => {
    refresh.mockRejectedValue(GONE());
    await render();
    await fireEvent.press(screen.getByRole('button', { name: 'Làm mới số liệu' }));
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('error', 'Dự án không còn');
  });

  it('XOÁ mà server báo 404 (đã bị xoá ở nơi khác) ⇒ coi như xong: toast "Dự án không còn" rồi lùi lại', async () => {
    remove.mockRejectedValue(GONE());
    await render();
    await fireEvent.press(screen.getByRole('button', { name: 'Xoá khỏi hồ sơ' }));
    await fireEvent.press(screen.getAllByRole('button', { name: 'Xoá khỏi hồ sơ' }).at(-1)!);
    await waitFor(() => expect(remove).toHaveBeenCalledWith('pj-9'));
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
    expect(showToast).toHaveBeenCalledWith('error', 'Dự án không còn');
  });
});
