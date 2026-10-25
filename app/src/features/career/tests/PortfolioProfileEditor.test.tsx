import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { showToast } from '@/shared/utils/toast.utils';
import { useAuthStore } from '@/shell/store/slices/auth';

import { portfolioService } from '../api/portfolio.service';
import { PortfolioProfileEditor } from '../components/portfolio/PortfolioProfileEditor';
import { makePortfolio } from './portfolio.fixtures';
import { apiError, renderPortfolio } from './portfolio.harness';

/**
 * app.md p6-07 §3, §8 "Thông tin": lưu gửi ĐỦ hồ sơ (BE `.strict()`) kèm `expectedVersion`; tạo lần đầu `expectedVersion: 0` với tên tài khoản; liên kết chỉ https; đếm grapheme; RES_003 giữ nội dung
 * đang gõ; lỗi khác hiện TRONG form (không toast).
 */
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('@/shell/capabilities', () => ({
  useCapabilities: () => ({ data: undefined }),
  useFeature: () => true,
}));
// `useAssetUrl` đặt `gcTime: 60_000` cho truy vấn URL ảnh: bộ đếm thu gom 60 giây giữ Jest sống thêm một phút sau khi tháo màn.
jest.mock('@/core/uploads/use-asset-url', () => ({ useAssetUrl: () => ({ data: undefined }) }));

const save = jest.spyOn(portfolioService, 'save');
const reload = jest.fn();
const PORTFOLIO = makePortfolio({ version: 3 });

const render = (portfolio = PORTFOLIO) =>
  renderPortfolio(<PortfolioProfileEditor portfolio={portfolio} reload={reload} />);
const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore
    .getState()
    .setAuth({
      token: 't',
      user: { email: 'a@b.c', id: 'u-1', name: 'Trần Thị Bình', permissions: [], roles: [] },
    });
});

describe('PortfolioProfileEditor', () => {
  it('điền sẵn từ hồ sơ, có bộ đếm ký tự theo giới hạn; lưu gửi ĐỦ trường + expectedVersion, xong ⇒ toast + quay lại', async () => {
    save.mockResolvedValue({ ...PORTFOLIO, version: 4 });
    await render();
    expect(screen.getByDisplayValue('Nguyễn Văn An')).toBeOnTheScreen();
    expect(screen.getByText('13/60')).toBeOnTheScreen();
    await press('Lưu thông tin');
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const body = save.mock.calls[0]![0];
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
    expect(body).toMatchObject({
      displayName: 'Nguyễn Văn An',
      expectedVersion: 3,
      links: [{ label: 'GitHub', url: 'https://github.com/an' }],
      seoIndexable: false,
    });
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(showToast).toHaveBeenCalledWith('success', 'Đã lưu thông tin hồ sơ');
  });

  it('chưa có hồ sơ: tên lấy từ tài khoản, lưu đầu tiên `expectedVersion: 0` (BE tạo lười), chưa có khối đường dẫn', async () => {
    save.mockResolvedValue(makePortfolio({ version: 1 }));
    await render(null as never);
    expect(screen.getByDisplayValue('Trần Thị Bình')).toBeOnTheScreen();
    expect(screen.queryByText('Đường dẫn công khai')).toBeNull();
    await press('Lưu thông tin');
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: 'Trần Thị Bình',
          expectedVersion: 0,
          theme: { accent: 'GREEN', template: 'CLASSIC' },
        }),
      ),
    );
  });

  it('liên kết http:// hoặc có tài khoản ⇒ lỗi tại ô, KHÔNG gửi; thêm liên kết tối đa 6', async () => {
    await render();
    await fireEvent.changeText(
      screen.getByDisplayValue('https://github.com/an'),
      'http://khong-an-toan.com',
    );
    await press('Lưu thông tin');
    expect(await screen.findByText('Liên kết phải là địa chỉ https:// hợp lệ')).toBeOnTheScreen();
    expect(save).not.toHaveBeenCalled();
    for (let i = 0; i < 5; i += 1) await press('Thêm liên kết');
    expect(screen.getByRole('button', { name: 'Đã đạt tối đa 6 liên kết' })).toBeDisabled();
  });

  it('tên quá ngắn ⇒ lỗi, không gửi', async () => {
    await render();
    await fireEvent.changeText(screen.getByDisplayValue('Nguyễn Văn An'), 'A');
    await press('Lưu thông tin');
    expect(await screen.findByText('Tên hiển thị tối thiểu 2 ký tự')).toBeOnTheScreen();
    expect(save).not.toHaveBeenCalled();
  });

  it('RES_003 ⇒ banner + GIỮ nội dung đang gõ; "Tải lại" xong lưu tiếp với version MỚI', async () => {
    save
      .mockRejectedValueOnce(apiError(409, 'RES_003'))
      .mockResolvedValue({ ...PORTFOLIO, version: 8 });
    reload.mockResolvedValue({ ...PORTFOLIO, version: 7 });
    await render();
    await fireEvent.changeText(screen.getByDisplayValue('Nguyễn Văn An'), 'Tên mới của tôi');
    await press('Lưu thông tin');
    expect(await screen.findByText('Hồ sơ vừa được thay đổi ở nơi khác')).toBeOnTheScreen();
    expect(screen.getByDisplayValue('Tên mới của tôi')).toBeOnTheScreen();
    await press('Tải lại');
    await waitFor(() => expect(reload).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByText('Hồ sơ vừa được thay đổi ở nơi khác')).toBeNull(),
    );
    await press('Lưu thông tin');
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]![0]).toMatchObject({
      displayName: 'Tên mới của tôi',
      expectedVersion: 7,
    });
  });

  it('lỗi khác (ASSET_003 — ảnh chưa sẵn sàng) ⇒ hiện TRONG form bằng câu của bảng lỗi chung, không toast, không thoát màn', async () => {
    save.mockRejectedValue(apiError(400, 'ASSET_003'));
    await render();
    await press('Lưu thông tin');
    expect(await screen.findByText('Tệp chưa sẵn sàng để sử dụng')).toBeOnTheScreen();
    expect(showToast).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });
});
