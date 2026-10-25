import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { contributionService } from '../api/contribution.service';
import { MemberBreakdownContent } from '../components/MemberBreakdownContent';
import { BOARD, FORMULA, makeMember, makePointsOnlyMember, makeTask, TZ, USER_A } from './fixtures';
import { httpError, renderWithClient } from './harness';

/**
 * Chi tiết một thành viên (app.md §3, §8): số gốc từng thành phần, câu công thức áp số do server dựng, trọng số đã chia lại, và danh sách THẺ được tính (cursor 50/trang) — mỗi
 * điểm truy được về thẻ gốc. Mock ở tầng service (không mạng).
 */
jest.mock('../api/contribution.service', () => ({
  ...jest.requireActual('../api/contribution.service'),
  contributionService: { memberTasks: jest.fn() },
}));

const mockedTasks = contributionService.memberTasks as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockedTasks.mockResolvedValue({ items: [makeTask()], nextCursor: null });
});

const renderContent = (member = makeMember()) =>
  renderWithClient(<MemberBreakdownContent boardId={BOARD} member={member} period="ALL" timezone={TZ} weights={FORMULA.weights} />);

describe('MemberBreakdownContent', () => {
  it('số gốc từng thành phần + câu công thức áp số của SERVER + trọng số áp dụng', async () => {
    await renderContent();

    expect(screen.getByText('91,0 điểm')).toBeOnTheScreen();
    expect(screen.getByText('58,7% của nhóm')).toBeOnTheScreen();
    expect(screen.getByText('8 điểm thẻ · 100%')).toBeOnTheScreen();
    expect(screen.getByText('3/4 đúng hạn · 75%')).toBeOnTheScreen();
    expect(screen.getByText('chấm 8,0 (5 lượt) · 80%')).toBeOnTheScreen();
    expect(screen.getByText('60 × 8/8 + 20 × 3/4 + 20 × 8,0/10 = 91,0')).toBeOnTheScreen();
    expect(screen.getByText('Trọng số áp dụng: điểm thẻ 60 · đúng hạn 20 · điểm chấm 20')).toBeOnTheScreen();
  });

  it('thành phần chưa có dữ liệu: chữ + câu chia lại, KHÔNG phải 0', async () => {
    await renderContent(makePointsOnlyMember({ id: USER_A }));

    expect(screen.getAllByText('Chưa có dữ liệu')).toHaveLength(2);
    expect(screen.getByText('20 % đúng hạn và 20 % điểm chấm được chia lại cho thành phần còn lại')).toBeOnTheScreen();
    expect(screen.getByText('Trọng số áp dụng: điểm thẻ 100')).toBeOnTheScreen();
  });

  const withTasks = (...items: ReturnType<typeof makeTask>[]) => mockedTasks.mockResolvedValue({ items, nextCursor: null });

  it('một thẻ đúng hạn: tiêu đề, điểm, hạn/ngày xong THEO MÚI GIỜ NHÓM, "Đúng hạn" bằng chữ, điểm chấm', async () => {
    withTasks(makeTask({ taskId: 't1', title: 'Viết báo cáo' }));
    await renderContent();

    expect(await screen.findByText('Viết báo cáo')).toBeOnTheScreen();
    expect(screen.getByText('3 điểm')).toBeOnTheScreen();
    expect(screen.getByText('Hạn 15/09/2026 · Xong 14/09/2026')).toBeOnTheScreen();
    expect(screen.getByText('Điểm chấm 8,0 (2 lượt)')).toBeOnTheScreen();
    // Nhãn thành phần "Đúng hạn" ở phần số gốc + nhãn của thẻ.
    expect(screen.getAllByText('Đúng hạn')).toHaveLength(2);
  });

  it('thẻ chung nhiều người: điểm chia đều ("chia 2 người"); không có hạn: "Không có hạn"; chưa có lượt chấm: nói thẳng', async () => {
    withTasks(makeTask({ assigneeCount: 2, dueDate: null, onTime: null, reviewCount: 0, reviewScoreAvg: null, sharedPoints: 1.5, storyPoints: 3, title: 'Thiết kế màn hình' }));
    await renderContent();

    expect(await screen.findByText('Thiết kế màn hình')).toBeOnTheScreen();
    expect(screen.getByText('1,5 điểm · chia 2 người')).toBeOnTheScreen();
    expect(screen.getByText('Không có hạn')).toBeOnTheScreen();
    expect(screen.getByText('Chưa có lượt chấm')).toBeOnTheScreen();
  });

  it('thẻ trễ hạn + chưa gán điểm thẻ: "Trễ hạn" bằng chữ và lý do điểm mặc định', async () => {
    withTasks(makeTask({ dueDate: '2026-09-12T16:59:59.000Z', onTime: false, sharedPoints: 1, storyPoints: null, title: 'Sửa lỗi nhỏ' }));
    await renderContent();

    expect(await screen.findByText('Sửa lỗi nhỏ')).toBeOnTheScreen();
    expect(screen.getByText('Trễ hạn')).toBeOnTheScreen();
    expect(screen.getByText('1 điểm · chưa gán điểm thẻ')).toBeOnTheScreen();
  });

  it('thẻ đã xoá: server không trả tiêu đề, app hiện "(đã xoá)" — điểm vẫn truy được', async () => {
    withTasks(makeTask({ deleted: true, title: null }));
    await renderContent();

    expect(await screen.findByText('(đã xoá)')).toBeOnTheScreen();
    expect(screen.getByText('3 điểm')).toBeOnTheScreen();
  });

  it('phân trang cursor: có trang kế → "Tải thêm" nối thêm thẻ, dùng đúng cursor của server', async () => {
    mockedTasks
      .mockResolvedValueOnce({ items: [makeTask({ taskId: 't1', title: 'Thẻ trang 1' })], nextCursor: 'cursor-2' })
      .mockResolvedValueOnce({ items: [makeTask({ taskId: 't2', title: 'Thẻ trang 2' })], nextCursor: null });
    await renderContent();

    expect(await screen.findByText('Thẻ trang 1')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tải thêm' }));

    expect(await screen.findByText('Thẻ trang 2')).toBeOnTheScreen();
    expect(screen.getByText('Thẻ trang 1')).toBeOnTheScreen();
    expect(mockedTasks).toHaveBeenLastCalledWith(BOARD, USER_A, 'ALL', 'cursor-2');
    expect(screen.queryByRole('button', { name: 'Tải thêm' })).toBeNull();
  });

  it('chưa có thẻ nào → "Chưa có thẻ nào được tính"', async () => {
    mockedTasks.mockResolvedValue({ items: [], nextCursor: null });
    await renderContent();

    expect(await screen.findByText('Chưa có thẻ nào được tính')).toBeOnTheScreen();
  });

  it('lỗi tải danh sách thẻ → báo có "Thử lại"; phần số gốc phía trên vẫn hiện', async () => {
    mockedTasks.mockRejectedValueOnce(httpError(500, 'FOO_999', 'Máy chủ bận')).mockResolvedValue({ items: [makeTask()], nextCursor: null });
    await renderContent();

    expect(await screen.findByText('Không tải được danh sách thẻ')).toBeOnTheScreen();
    expect(screen.getByText('91,0 điểm')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }));

    await waitFor(() => expect(screen.getByText('Viết báo cáo')).toBeOnTheScreen());
  });
});
