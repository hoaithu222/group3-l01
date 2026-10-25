import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { resourcePickerService } from '../api/resource-picker.service';
import { ResourcePickerSheet } from '../components/ResourcePickerSheet';
import { apiError, renderWithProviders } from './o2o-test-utils';

/**
 * "Chọn từ tài liệu nhóm": chọn nhóm → chọn PDF (thư mục gốc, hoặc tìm cả nhóm khi gõ ≥ 2 ký tự) → trả `{ id, name }`. Chỉ ĐỌC qua service riêng của feature
 * (không import `features/resources`). Quyền đọc do BE kiểm khi tạo đơn — ở đây chỉ liệt kê những gì BE cho thấy.
 */
jest.mock('../api/resource-picker.service', () => ({
  PICKER_MIN_QUERY: 2,
  PICKER_PAGE_SIZE: 30,
  resourcePickerService: { workspaces: jest.fn(), pdfs: jest.fn() },
}));

const service = jest.mocked(resourcePickerService);
const page = (
  items: { id: string; name: string; size: number }[],
  nextCursor: string | null = null,
) => ({
  items,
  meta: { nextCursor, hasMore: nextCursor !== null, limit: 30 },
});

function setup() {
  const onPick = jest.fn();
  const onClose = jest.fn();
  return { onPick, onClose, ui: <ResourcePickerSheet visible onClose={onClose} onPick={onPick} /> };
}

beforeEach(() => {
  jest.clearAllMocks();
  service.workspaces.mockResolvedValue([
    { id: 'ws-1', name: 'Nhóm đồ án' },
    { id: 'ws-2', name: 'Lớp CNTT' },
  ]);
  service.pdfs.mockResolvedValue(
    page([
      { id: 'res-1', name: 'Slide tuần 3.pdf', size: 1_572_864 },
      { id: 'res-2', name: 'Đề cương.pdf', size: 204_800 },
    ]),
  );
});

describe('ResourcePickerSheet', () => {
  it('bước 1 liệt kê NHÓM; chọn nhóm → bước 2 liệt kê PDF ở thư mục gốc (kèm dung lượng)', async () => {
    const { ui } = setup();
    await renderWithProviders(ui);

    await fireEvent.press(await screen.findByRole('button', { name: 'Nhóm đồ án' }));

    expect(await screen.findByText('Slide tuần 3.pdf')).toBeOnTheScreen();
    expect(screen.getByText('1,5 MB')).toBeOnTheScreen();
    expect(service.pdfs).toHaveBeenCalledWith('ws-1', '', undefined);
  });

  it('chọn một tệp → onPick({id, name}) rồi đóng tờ', async () => {
    const { ui, onPick, onClose } = setup();
    await renderWithProviders(ui);
    await fireEvent.press(await screen.findByRole('button', { name: 'Nhóm đồ án' }));

    await fireEvent.press(await screen.findByRole('button', { name: /Slide tuần 3.pdf/ }));

    expect(onPick).toHaveBeenCalledWith({ id: 'res-1', name: 'Slide tuần 3.pdf' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('gõ ≥ 2 ký tự → tìm cả nhóm (debounce); 1 ký tự vẫn là danh sách gốc, không tải lại', async () => {
    const { ui } = setup();
    await renderWithProviders(ui);
    await fireEvent.press(await screen.findByRole('button', { name: 'Nhóm đồ án' }));
    await screen.findByText('Slide tuần 3.pdf');
    service.pdfs.mockClear();

    await fireEvent.changeText(screen.getByPlaceholderText('Tìm tên tệp PDF'), 'đ');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
    expect(service.pdfs).not.toHaveBeenCalled(); // 1 ký tự dưới ngưỡng tìm của BE (2) — vẫn danh sách gốc đã có

    await fireEvent.changeText(screen.getByPlaceholderText('Tìm tên tệp PDF'), 'đề');
    await waitFor(() => expect(service.pdfs).toHaveBeenCalledWith('ws-1', 'đề', undefined));

    await fireEvent.changeText(screen.getByPlaceholderText('Tìm tên tệp PDF'), 'đề cương');
    await waitFor(() => expect(service.pdfs).toHaveBeenCalledWith('ws-1', 'đề cương', undefined));
  });

  it('nhóm không có PDF → nói rõ và gợi ý tải PDF lên từ máy', async () => {
    service.pdfs.mockResolvedValue(page([]));
    const { ui } = setup();
    await renderWithProviders(ui);
    await fireEvent.press(await screen.findByRole('button', { name: 'Lớp CNTT' }));

    expect(await screen.findByText('Không có tệp PDF')).toBeOnTheScreen();
    expect(screen.getByText(/Bạn có thể tải PDF lên từ máy/)).toBeOnTheScreen();
  });

  it('chưa thuộc nhóm nào → "Chưa có nhóm"', async () => {
    service.workspaces.mockResolvedValue([]);
    const { ui } = setup();
    await renderWithProviders(ui);

    expect(await screen.findByText('Chưa có nhóm')).toBeOnTheScreen();
  });

  it('lỗi tải nhóm / tệp → hiện lỗi + Thử lại', async () => {
    service.workspaces.mockRejectedValueOnce(apiError(500, 'SYS_500'));
    const { ui } = setup();
    await renderWithProviders(ui);

    await fireEvent.press(await screen.findByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('button', { name: 'Nhóm đồ án' })).toBeOnTheScreen();

    service.pdfs.mockRejectedValueOnce(apiError(500, 'SYS_500'));
    await fireEvent.press(screen.getByRole('button', { name: 'Nhóm đồ án' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Slide tuần 3.pdf')).toBeOnTheScreen();
  });

  it('"Chọn nhóm khác" quay về danh sách nhóm; còn trang sau → "Xem thêm" tải bằng cursor', async () => {
    service.pdfs.mockResolvedValueOnce(page([{ id: 'res-1', name: 'A.pdf', size: 10 }], 'c2'));
    service.pdfs.mockResolvedValueOnce(page([{ id: 'res-3', name: 'B.pdf', size: 10 }]));
    const { ui } = setup();
    await renderWithProviders(ui);
    await fireEvent.press(await screen.findByRole('button', { name: 'Nhóm đồ án' }));

    await fireEvent.press(await screen.findByRole('button', { name: 'Xem thêm' }));
    expect(await screen.findByText('B.pdf')).toBeOnTheScreen();
    expect(service.pdfs).toHaveBeenCalledWith('ws-1', '', 'c2');

    await fireEvent.press(screen.getByRole('button', { name: 'Chọn nhóm khác' }));
    expect(await screen.findByRole('button', { name: 'Lớp CNTT' })).toBeOnTheScreen();
  });
});
