import { userEvent, waitFor } from '@testing-library/react-native';

import {
  add,
  apiError,
  LINKED,
  list,
  listTasks,
  pickDirection,
  remove,
  renderSection,
} from './dependency-section-setup';
import { makeData } from './fixtures';

// Thư viện thật là ESM thuần nên Jest không nạp được — xem tests/mocks/fractional-indexing.ts.
// ⚠️ `jest.mock` phải ở ĐÂY (chỉ được nâng lên đầu trong file khai nó); tay cầm mock + hàm dựng ở `dependency-section-setup.tsx`.
jest.mock('fractional-indexing', () => jest.requireActual('./mocks/fractional-indexing'));
jest.mock('../api/dependencies.service', () => ({
  dependenciesService: { add: jest.fn(), list: jest.fn(), remove: jest.fn() },
}));
jest.mock('../api/tasks.service', () => ({
  labelsService: {},
  tasksService: { create: jest.fn(), list: jest.fn(), move: jest.fn() },
}));

beforeEach(() => {
  jest.clearAllMocks();
  list.mockResolvedValue(LINKED);
  listTasks.mockResolvedValue(makeData());
  add.mockResolvedValue({ created: true, dependency: {} as never });
  remove.mockResolvedValue(undefined);
});

describe('DependencySection', () => {
  it('hai nhóm "Bị chặn bởi" / "Đang chặn": tiêu đề, chip cột, hạn; chạm một dòng mở thẻ đó', async () => {
    const { onOpenTask, screen } = await renderSection();

    expect(await screen.findByText('Bị chặn bởi')).toBeOnTheScreen();
    expect(screen.getByText('Đang chặn')).toBeOnTheScreen();
    expect(screen.getByText('Thiết kế giao diện')).toBeOnTheScreen();
    expect(screen.getByText('Đang làm')).toBeOnTheScreen();
    expect(screen.getByText('Cần làm')).toBeOnTheScreen();

    await userEvent.press(screen.getByText('Kiểm thử'));
    expect(onOpenTask).toHaveBeenCalledWith('d9');
  });

  it('chưa có phụ thuộc: câu rỗng + MỘT nút "Thêm phụ thuộc"; hai hướng chỉ hiện sau khi bấm nút', async () => {
    list.mockResolvedValue({ predecessors: [], successors: [] });
    const { screen } = await renderSection();

    expect(await screen.findByText('Chưa có phụ thuộc')).toBeOnTheScreen();
    expect(screen.getByText('Thêm phụ thuộc')).toBeOnTheScreen();
    expect(screen.queryByText('Thẻ phải xong trước')).toBeNull();

    await userEvent.press(screen.getByText('Thêm phụ thuộc'));
    expect(await screen.findByText('Thẻ phải xong trước')).toBeOnTheScreen();
    expect(screen.getByText('Thẻ đang chờ thẻ này')).toBeOnTheScreen();
  });

  it('offline / không quyền (canEdit = false): KHÔNG có nút thêm hay gỡ, danh sách vẫn đọc được', async () => {
    const { screen } = await renderSection(false);

    expect(await screen.findByText('Thiết kế giao diện')).toBeOnTheScreen();
    expect(screen.queryByText('Thêm phụ thuộc')).toBeNull();
    expect(screen.queryByLabelText('Gỡ phụ thuộc với thẻ Thiết kế giao diện')).toBeNull();
  });

  it('thêm thẻ CHẶN: tấm chọn loại thẻ hiện tại và thẻ đã nối; chọn → POST trên thẻ này với predecessorId là thẻ đã chọn', async () => {
    const { screen } = await renderSection();
    await screen.findByText('Thiết kế giao diện');

    await pickDirection(screen, 'Thẻ phải xong trước');
    expect(await screen.findByText('Chọn thẻ đang chặn thẻ này')).toBeOnTheScreen();
    // Hàng của tấm chọn là `ListItem` (tiêu đề thẻ = nhãn hàng) — tìm theo tiêu đề thay cho nhãn trợ năng tự ghép cũ.
    await waitFor(() => expect(screen.getByText('Thẻ t3')).toBeOnTheScreen());
    // t1 là chính thẻ này, t2 và d9 đã nối — không được chọn lại.
    expect(screen.queryByText('Thẻ t1')).toBeNull();
    expect(screen.queryByText('Thẻ t2')).toBeNull();

    await userEvent.press(screen.getByText('Thẻ t3'));

    await waitFor(() => expect(add).toHaveBeenCalledWith('t1', 't3'));
    await waitFor(() => expect(screen.queryByText('Chọn thẻ đang chặn thẻ này')).toBeNull());
  });

  it('thêm thẻ BỊ CHẶN: POST trên thẻ được chọn (thẻ sau) với predecessorId là thẻ hiện tại', async () => {
    const { screen } = await renderSection();
    await screen.findByText('Thiết kế giao diện');

    await pickDirection(screen, 'Thẻ đang chờ thẻ này');
    await userEvent.press(await screen.findByText('Thẻ t3'));

    await waitFor(() => expect(add).toHaveBeenCalledWith('t3', 't1'));
  });

  it('TASK_005 (vòng): Alert liệt kê TIÊU ĐỀ trong vòng, tấm ở lại để chọn thẻ khác', async () => {
    add.mockRejectedValue(apiError('TASK_005', { cycle: ['t1', 't2', 't3'] }));
    const { screen } = await renderSection();
    await screen.findByText('Thiết kế giao diện');

    await pickDirection(screen, 'Thẻ phải xong trước');
    await userEvent.press(await screen.findByText('Thẻ t3'));

    expect(
      await screen.findByText(/Tạo vòng phụ thuộc: Thẻ t1 → Thẻ t2 → Thẻ t3 → Thẻ t1/),
    ).toBeOnTheScreen();
    expect(screen.getByText('Chọn thẻ đang chặn thẻ này')).toBeOnTheScreen();
  });

  it('TASK_018 (đạt số phụ thuộc tối đa): thông điệp hiện TẠI tấm chọn', async () => {
    add.mockRejectedValue(apiError('TASK_018'));
    const { screen } = await renderSection();
    await screen.findByText('Thiết kế giao diện');

    await pickDirection(screen, 'Thẻ phải xong trước');
    await userEvent.press(await screen.findByText('Thẻ t3'));

    expect(await screen.findByText('Thẻ đã đạt số phụ thuộc tối đa')).toBeOnTheScreen();
  });

  it('gỡ có XÁC NHẬN: nút gỡ chỉ mở hộp thoại; đồng ý mới DELETE (thẻ trước → DELETE trên thẻ này)', async () => {
    const { screen } = await renderSection();
    await screen.findByText('Thiết kế giao diện');

    await userEvent.press(screen.getByLabelText('Gỡ phụ thuộc với thẻ Thiết kế giao diện'));
    expect(remove).not.toHaveBeenCalled();
    expect(await screen.findByText('Gỡ phụ thuộc?')).toBeOnTheScreen();

    await userEvent.press(screen.getByText('Gỡ'));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('t1', 't2'));
  });

  it('gỡ thẻ SAU (nhóm "Đang chặn"): DELETE chạy trên thẻ sau với predecessorId là thẻ này', async () => {
    const { screen } = await renderSection();
    await screen.findByText('Kiểm thử');

    await userEvent.press(screen.getByLabelText('Gỡ phụ thuộc với thẻ Kiểm thử'));
    await userEvent.press(await screen.findByText('Gỡ'));

    await waitFor(() => expect(remove).toHaveBeenCalledWith('d9', 't1'));
  });

  it('lỗi tải: câu báo + nút Thử lại', async () => {
    list.mockRejectedValueOnce(new Error('mất mạng'));
    const { screen } = await renderSection();

    expect(await screen.findByText(/Không tải được phụ thuộc/)).toBeOnTheScreen();
    await userEvent.press(screen.getByText('Thử lại'));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });
});
