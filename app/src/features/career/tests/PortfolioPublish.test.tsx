import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { showToast } from '@/shared/utils/toast.utils';

import { portfolioService } from '../api/portfolio.service';
import { PortfolioHomeScreen } from '../screens/portfolio/PortfolioHomeScreen';
import { makeBuild, makeOverview, makePortfolio, makeProject } from './portfolio.fixtures';
import { apiError, renderPortfolio } from './portfolio.harness';

/**
 * app.md p6-07 §3, §8: `PublishSheet` (checklist chặn khi không có dự án hiển thị, tóm tắt huy hiệu, câu lỗi PORT_008/009/010 + RES_003 giữ TRONG tấm) và Ngừng công khai nói thật về trễ 5 phút.
 * Tiến độ dựng trang (socket/poll) ở `PortfolioBuildProgress.test.tsx`.
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
// Huy hiệu + quyền `showSkills` chỉ tải khi TẤM mở (`PublishSummary`): `mockUseMySkills` đếm số lần được gọi.
const mockCareer = {
  showSkills: undefined as boolean | undefined,
  skills: [] as { revoked: boolean }[],
};
const mockUseMySkills = jest.fn(() => ({ data: mockCareer.skills }));
jest.mock('../queries/career.queries', () => ({
  useMyCareer: () => ({
    data:
      mockCareer.showSkills === undefined
        ? undefined
        : { visibility: { showSkills: mockCareer.showSkills } },
  }),
  useMySkills: () => mockUseMySkills(),
}));

const overview = jest.spyOn(portfolioService, 'overview');
const publish = jest.spyOn(portfolioService, 'publish');
const unpublish = jest.spyOn(portfolioService, 'unpublish');

const URL_PUBLIC = 'https://superapp.vcijsc.com/p/an-dev';
const PUBLISHED = makeOverview({
  portfolio: makePortfolio({ status: 'PUBLISHED' }),
  publicUrl: URL_PUBLIC,
});

/** Mở tấm: nút "Công khai" của THANH ĐÁY (tấm chưa mở nên chỉ có một). */
async function openSheet(label = 'Công khai') {
  await fireEvent.press(await screen.findByRole('button', { name: label }));
}
/** Nút TRONG tấm/hộp thoại: `Modal` nằm trong vùng cuộn của `Screen`, TRƯỚC `footer` trong cây ⇒ là nút đầu tiên trong các nút cùng tên (thanh đáy còn nút cùng tên phía sau). */
const sheetButton = (label: string) => screen.getAllByRole('button', { name: label })[0]!;

beforeEach(() => {
  jest.clearAllMocks();
  mockCareer.showSkills = undefined;
  mockCareer.skills = [];
  overview.mockResolvedValue(makeOverview());
});

describe('PublishSheet', () => {
  it('không có dự án đang hiện ⇒ checklist "chưa đạt" và nút Công khai trong tấm bị KHOÁ', async () => {
    overview.mockResolvedValue(makeOverview({ projects: [makeProject({ visible: false })] }));
    await renderPortfolio(<PortfolioHomeScreen />);
    await openSheet();
    expect(
      await screen.findByLabelText('Có ít nhất một dự án đang hiện trên trang: chưa đạt'),
    ).toBeOnTheScreen();
    expect(sheetButton('Công khai')).toBeDisabled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('tóm tắt đếm huy hiệu CÒN HIỆU LỰC và chỉ khi được phép hiện; truy vấn huy hiệu chỉ chạy khi tấm mở', async () => {
    mockCareer.skills = [{ revoked: false }, { revoked: false }, { revoked: true }];
    await renderPortfolio(<PortfolioHomeScreen />);
    await screen.findByText('Bản nháp');
    expect(mockUseMySkills).not.toHaveBeenCalled(); // tấm chưa mở ⇒ chưa tốn lượt tải
    await openSheet();
    expect(
      await screen.findByText('Sẽ công khai: số liệu 1 dự án, 2 huy hiệu, giới thiệu, 1 liên kết.'),
    ).toBeOnTheScreen();
  });

  it('người dùng TẮT hiện huy hiệu (showSkills=false) ⇒ tóm tắt không nêu huy hiệu', async () => {
    mockCareer.skills = [{ revoked: false }];
    mockCareer.showSkills = false;
    await renderPortfolio(<PortfolioHomeScreen />);
    await openSheet();
    expect(
      await screen.findByText('Sẽ công khai: số liệu 1 dự án, giới thiệu, 1 liên kết.'),
    ).toBeOnTheScreen();
  });

  it('công khai ⇒ POST kèm expectedVersion của hồ sơ, tấm đóng, thẻ hiện "Đang tạo trang…" và thanh đáy khoá', async () => {
    publish.mockResolvedValue({ buildId: 'bd-1', buildVersion: 1 });
    await renderPortfolio(<PortfolioHomeScreen />);
    await openSheet();
    expect(
      await screen.findByText('Sẽ công khai: số liệu 1 dự án, giới thiệu, 1 liên kết.'),
    ).toBeOnTheScreen();
    await fireEvent.press(sheetButton('Công khai'));
    await waitFor(() => expect(publish).toHaveBeenCalledWith(3));
    expect(await screen.findByText('Đang xếp hàng tạo trang…')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Đang tạo trang…' })).toBeDisabled();
    await waitFor(() => expect(screen.queryByText('Công khai hồ sơ')).toBeNull()); // tấm đã đóng
  });

  it.each([
    [
      'PORT_008 (bị gỡ)',
      apiError(403, 'PORT_008'),
      'Hồ sơ đã bị gỡ do vi phạm. Liên hệ hỗ trợ để được xem xét.',
    ],
    ['PORT_009 (đang dựng)', apiError(409, 'PORT_009'), 'Hồ sơ đang được tạo trang, vui lòng đợi.'],
    [
      'PORT_010 (chưa có nội dung)',
      apiError(400, 'PORT_010', { emptySections: ['PROJECTS'], visibleSections: ['PROJECTS'] }),
      'Hồ sơ chưa có nội dung để công khai. Hãy bổ sung nội dung cho: Dự án.',
    ],
    [
      'RES_003 (lệch phiên bản)',
      apiError(409, 'RES_003'),
      'Hồ sơ vừa được thay đổi ở nơi khác. Đã tải bản mới — hãy kiểm tra rồi bấm lại.',
    ],
  ])('%s ⇒ câu tiếng Việt GIỮ trong tấm (không toast)', async (_name, error, message) => {
    publish.mockRejectedValue(error);
    await renderPortfolio(<PortfolioHomeScreen />);
    await openSheet();
    await fireEvent.press(sheetButton('Công khai'));
    expect(await screen.findByText(message)).toBeOnTheScreen();
    expect(showToast).not.toHaveBeenCalled();
  });
});

describe('Ngừng công khai', () => {
  it('hộp thoại nói thật "có thể còn thấy tối đa 5 phút"; xác nhận ⇒ POST unpublish + toast', async () => {
    overview.mockResolvedValue({ ...PUBLISHED, latestBuild: makeBuild({ status: 'READY' }) });
    unpublish.mockResolvedValue({ status: 'UNPUBLISHED' });
    await renderPortfolio(<PortfolioHomeScreen />);
    await openSheet('Ngừng công khai');
    expect(await screen.findByText(/tối đa 5 phút/)).toBeOnTheScreen();
    await fireEvent.press(sheetButton('Ngừng công khai'));
    await waitFor(() => expect(unpublish).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('success', 'Đã ngừng công khai hồ sơ'),
    );
  });

  it('có thay đổi chưa cập nhật ⇒ nút chính là "Cập nhật trang"', async () => {
    overview.mockResolvedValue({
      ...PUBLISHED,
      latestBuild: makeBuild({ status: 'READY' }),
      portfolio: makePortfolio({ hasUnpublishedChanges: true, status: 'PUBLISHED' }),
    });
    await renderPortfolio(<PortfolioHomeScreen />);
    expect(await screen.findByRole('button', { name: 'Cập nhật trang' })).toBeOnTheScreen();
    expect(screen.getByText(/Bạn đã thay đổi hồ sơ/)).toBeOnTheScreen();
  });
});
