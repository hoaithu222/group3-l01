import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { showToast } from '@/shared/utils/toast.utils';

import { portfolioService } from '../api/portfolio.service';
import { PortfolioAppearanceEditor } from '../components/portfolio/PortfolioAppearanceEditor';
import { makePortfolio, TEMPLATES } from './portfolio.fixtures';
import { apiError, renderPortfolio } from './portfolio.harness';

/**
 * app.md p6-07 §3, §8 "Giao diện": `SectionOrderList` lên/xuống ĐỔI thứ tự rồi lưu gọi mutation với thứ tự mới (nháp, chỉ PUT khi bấm Lưu — lý do ở `usePortfolioAppearance`); mẫu/màu/SEO;
 * "Xem trước với mẫu này" mang tham số thử; RES_003 giữ nháp.
 */
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('@/shell/capabilities', () => ({
  useCapabilities: () => ({ data: undefined }),
  useFeature: () => true,
}));

const save = jest.spyOn(portfolioService, 'save');
const templates = jest.spyOn(portfolioService, 'templates');
const reload = jest.fn();
const PORTFOLIO = makePortfolio({ version: 3 });

const render = () =>
  renderPortfolio(<PortfolioAppearanceEditor portfolio={PORTFOLIO} reload={reload} />);
const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));

beforeEach(() => {
  jest.clearAllMocks();
  templates.mockResolvedValue(TEMPLATES);
});

describe('PortfolioAppearanceEditor', () => {
  it('chưa đổi gì ⇒ nút Lưu khoá; lên/xuống đổi thứ tự rồi Lưu gửi thứ tự MỚI kèm đủ trường hồ sơ + expectedVersion', async () => {
    save.mockResolvedValue({ ...PORTFOLIO, version: 4 });
    await render();
    expect(screen.getByRole('button', { name: 'Lưu giao diện' })).toBeDisabled();
    await press('Chuyển mục Dự án lên');
    await press('Chuyển mục Liên hệ xuống'); // đã ở cuối: bị khoá, không đổi gì
    await press('Lưu giao diện');
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const body = save.mock.calls[0]![0];
    expect(body.sections).toEqual([
      { kind: 'PROJECTS', order: 0, visible: true },
      { kind: 'ABOUT', order: 1, visible: true },
      { kind: 'SKILLS', order: 2, visible: true },
      { kind: 'CONTACT', order: 3, visible: true },
    ]);
    expect(Object.keys(body).sort()).toEqual([
      'avatarAssetId',
      'bio',
      'displayName',
      'expectedVersion',
      'headline',
      'links',
      'sections',
      'seoIndexable',
      'theme',
    ]);
    expect(body).toMatchObject({ displayName: 'Nguyễn Văn An', expectedVersion: 3 });
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(showToast).toHaveBeenCalledWith('success', 'Đã lưu giao diện');
  });

  it('nút lên ở mục đầu và nút xuống ở mục cuối bị khoá (không lệch thứ tự); tắt một mục ⇒ `visible: false`', async () => {
    save.mockResolvedValue({ ...PORTFOLIO, version: 4 });
    await render();
    expect(screen.getByRole('button', { name: 'Chuyển mục Giới thiệu lên' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Chuyển mục Liên hệ xuống' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('switch', { name: /Huy hiệu kỹ năng/ }));
    await press('Lưu giao diện');
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0]![0].sections.find((s) => s.kind === 'SKILLS')?.visible).toBe(false);
  });

  it('chọn mẫu + màu + bật công cụ tìm kiếm ⇒ theme/seoIndexable trong thân PUT', async () => {
    save.mockResolvedValue({ ...PORTFOLIO, version: 4 });
    await render();
    await fireEvent.press(await screen.findByRole('button', { name: /Mẫu Lập trình viên/ }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Xanh dương' }));
    await fireEvent.press(screen.getByRole('switch', { name: /Cho phép công cụ tìm kiếm/ }));
    await press('Lưu giao diện');
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0]![0]).toMatchObject({
      seoIndexable: true,
      theme: { accent: 'BLUE', template: 'DEVELOPER' },
    });
  });

  it('"Xem trước với mẫu này" mở xem trước với mẫu + màu ĐANG CHỌN (chưa lưu)', async () => {
    await render();
    await fireEvent.press(await screen.findByRole('button', { name: /Mẫu Lập trình viên/ }));
    await press('Xem trước với mẫu này');
    expect(router.push).toHaveBeenCalledWith(
      '/me/career/portfolio/preview?template=DEVELOPER&accent=GREEN',
    );
    expect(save).not.toHaveBeenCalled();
  });

  it('RES_003 ⇒ banner, nháp còn nguyên; "Tải lại" xong Lưu dùng version MỚI', async () => {
    save
      .mockRejectedValueOnce(apiError(409, 'RES_003'))
      .mockResolvedValue({ ...PORTFOLIO, version: 9 });
    reload.mockResolvedValue({ ...PORTFOLIO, version: 8 });
    await render();
    await press('Chuyển mục Dự án lên');
    await press('Lưu giao diện');
    expect(await screen.findByText('Hồ sơ vừa được thay đổi ở nơi khác')).toBeOnTheScreen();
    await press('Tải lại');
    await waitFor(() =>
      expect(screen.queryByText('Hồ sơ vừa được thay đổi ở nơi khác')).toBeNull(),
    );
    await press('Lưu giao diện');
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]![0]).toMatchObject({ expectedVersion: 8 });
    expect(save.mock.calls[1]![0].sections[0]?.kind).toBe('PROJECTS');
  });

  it('không tải được danh mục mẫu ⇒ Alert + Thử lại, các phần còn lại vẫn dùng được', async () => {
    templates.mockRejectedValueOnce(apiError(500, 'SYS_500')).mockResolvedValue(TEMPLATES);
    await render();
    expect(await screen.findByText('Không tải được danh sách mẫu.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Chuyển mục Dự án lên' })).toBeEnabled();
    await press('Thử lại');
    expect(await screen.findByRole('button', { name: /Mẫu Lập trình viên/ })).toBeOnTheScreen();
  });
});
