import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { showToast } from '@/shared/utils/toast.utils';

import { portfolioProjectService } from '../api/portfolio-project.service';
import { PortfolioProjectEditor } from '../components/portfolio/PortfolioProjectEditor';
import { portfolioKeys } from '../queries/portfolio.keys';
import { makeOverview, makeProject, makeSnapshot } from './portfolio.fixtures';
import { apiError, makePortfolioClient, renderPortfolio } from './portfolio.harness';

/**
 * app.md p6-07 §3, §8 "Sửa dự án": số liệu hệ thống có đơn vị + "Làm mới" (429 PORT_007 ⇒ ĐẾM NGƯỢC, không toast), toggle "Hiện tên đồng đội" đổi ghi chú riêng tư, lưu gửi đúng bộ khoá BE `.strict()`
 * với `expectedVersion` của DỰ ÁN, RES_003 giữ nguyên nội dung đang gõ, xoá khỏi hồ sơ qua hộp thoại.
 */
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('@/shell/capabilities', () => ({
  useCapabilities: () => ({ data: undefined }),
  useFeature: () => true,
}));
// `useAssetUrl` đặt `gcTime: 60_000` cho truy vấn URL ảnh: sau khi tháo màn, bộ đếm thu gom 60 giây giữ Jest sống thêm một phút. Ảnh không phải thứ ca này kiểm.
jest.mock('@/core/uploads/use-asset-url', () => ({ useAssetUrl: () => ({ data: undefined }) }));

const update = jest.spyOn(portfolioProjectService, 'update');
const refresh = jest.spyOn(portfolioProjectService, 'refresh');
const remove = jest.spyOn(portfolioProjectService, 'remove');

const PROJECT = makeProject({ id: 'pj-9', title: 'Dự án X', version: 4 });
const reload = jest.fn();

const render = (project = PROJECT) =>
  renderPortfolio(<PortfolioProjectEditor project={project} reload={reload} />);
const save = () => fireEvent.press(screen.getByRole('button', { name: 'Lưu dự án' }));
const settle = () =>
  act(async () => new Promise((resolve) => setTimeout(resolve, 20)).then(() => undefined));

beforeEach(() => jest.clearAllMocks());

describe('PortfolioProjectEditor', () => {
  it('số liệu hệ thống kèm ĐƠN VỊ + mốc chụp + lời nhắc "do hệ thống ghi nhận"', async () => {
    await render();
    expect(screen.getByText('40 task')).toBeOnTheScreen();
    expect(screen.getByText('62 điểm')).toBeOnTheScreen();
    expect(screen.getByText('90% đúng hạn')).toBeOnTheScreen();
    expect(screen.getByText(/^Cập nhật lúc /)).toBeOnTheScreen();
    expect(screen.getByText(/Dữ liệu do hệ thống ghi nhận/)).toBeOnTheScreen();
  });

  it('làm mới số liệu bị 429 PORT_007 ⇒ nút ĐẾM NGƯỢC theo Retry-After và khoá, KHÔNG toast', async () => {
    refresh.mockRejectedValue(apiError(429, 'PORT_007', { retryAfterSeconds: 42 }));
    await render();
    await fireEvent.press(screen.getByRole('button', { name: 'Làm mới số liệu' }));
    expect(await screen.findByRole('button', { name: 'Thử lại sau 42s' })).toBeDisabled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('làm mới thành công ⇒ vá số liệu mới vào cache hồ sơ và báo một lần', async () => {
    refresh.mockResolvedValue({ ...PROJECT, snapshot: makeSnapshot({ tasksDone: 41 }) });
    const client = makePortfolioClient();
    client.setQueryData(portfolioKeys.overview(), makeOverview({ projects: [PROJECT] }));
    await renderPortfolio(<PortfolioProjectEditor project={PROJECT} reload={reload} />, client);
    await fireEvent.press(screen.getByRole('button', { name: 'Làm mới số liệu' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('success', 'Đã làm mới số liệu'));
    expect(
      client.getQueryData<{ projects: { snapshot: { tasksDone: number } }[] }>(
        portfolioKeys.overview(),
      )?.projects[0]?.snapshot.tasksDone,
    ).toBe(41);
  });

  it('công tắc "Hiện tên đồng đội" đổi ghi chú riêng tư đúng hậu quả', async () => {
    await render(
      makeProject({ showTeammates: false, snapshot: makeSnapshot({ teammatesCount: 3 }) }),
    );
    expect(
      screen.getByText('Trang chỉ ghi "Làm cùng 3 đồng đội", không nêu tên ai.'),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('switch', { name: 'Hiện tên đồng đội' }));
    expect(
      await screen.findByText(/Chỉ hiện tên người đã đồng ý; người khác hiển thị là "Đồng đội"/),
    ).toBeOnTheScreen();
    expect(screen.getByText(/Số người được nêu tên sẽ hiện sau khi bạn lưu/)).toBeOnTheScreen();
  });

  it('lưu ⇒ PATCH đúng bộ khoá + expectedVersion của DỰ ÁN; thành công ⇒ toast + quay lại', async () => {
    update.mockResolvedValue({ ...PROJECT, version: 5 });
    await render();
    await save();
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const [id, body] = update.mock.calls[0]!;
    expect(id).toBe('pj-9');
    expect(Object.keys(body).sort()).toEqual([
      'coverAssetId',
      'expectedVersion',
      'highlights',
      'periodFrom',
      'periodTo',
      'role',
      'showTeammates',
      'summary',
      'title',
      'visible',
    ]);
    expect(body.expectedVersion).toBe(4);
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(showToast).toHaveBeenCalledWith('success', 'Đã lưu dự án');
  });

  it('tiêu đề trống ⇒ lỗi tại ô, KHÔNG gửi', async () => {
    await render();
    await fireEvent.changeText(screen.getByDisplayValue('Dự án X'), ' ');
    await save();
    expect(await screen.findByText('Tiêu đề tối thiểu 2 ký tự')).toBeOnTheScreen();
    expect(update).not.toHaveBeenCalled();
  });

  it('RES_003 ⇒ banner "Tải lại" GIỮ nội dung đang gõ; tải lại xong lưu tiếp bằng version MỚI', async () => {
    update
      .mockRejectedValueOnce(apiError(409, 'RES_003', { currentVersion: 6 }))
      .mockResolvedValue({ ...PROJECT, version: 7 });
    reload.mockResolvedValue({ ...PROJECT, version: 6 });
    await render();
    await fireEvent.changeText(screen.getByDisplayValue('Dự án X'), 'Tên tôi vừa gõ');
    await save();
    expect(await screen.findByText('Dự án vừa được thay đổi ở nơi khác')).toBeOnTheScreen();
    expect(screen.getByDisplayValue('Tên tôi vừa gõ')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tải lại' }));
    await waitFor(() =>
      expect(screen.queryByText('Dự án vừa được thay đổi ở nơi khác')).toBeNull(),
    );
    await settle();
    await save();
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update.mock.calls[1]![1]).toMatchObject({ expectedVersion: 6, title: 'Tên tôi vừa gõ' });
  });

  it('xoá khỏi hồ sơ: hộp thoại nói rõ chỉ gỡ khỏi hồ sơ; xác nhận ⇒ DELETE + toast + quay lại', async () => {
    remove.mockResolvedValue(undefined);
    await render();
    await fireEvent.press(screen.getByRole('button', { name: 'Xoá khỏi hồ sơ' }));
    expect(await screen.findByText(/Task và nhóm của bạn không bị xoá/)).toBeOnTheScreen();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Xoá khỏi hồ sơ' }).at(-1)!); // nút trong hộp thoại: sau nút mở hộp thoại trong cây
    await waitFor(() => expect(remove).toHaveBeenCalledWith('pj-9'));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(showToast).toHaveBeenCalledWith('success', 'Đã xoá dự án khỏi hồ sơ');
  });
});
