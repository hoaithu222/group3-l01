import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { useConnectionState } from '@/core/socket';

import { pollService } from '../api/poll.service';
import { CreatePollSheet } from '../components/poll/CreatePollSheet';
import { apiError, flushQuery, renderWithProviders, SCOPE } from './fixtures';

/**
 * `CreatePollSheet` (app.md §8): < 2 lựa chọn/trùng → không gửi; quá `optionsMax` ẩn nút thêm; `POLL_002` gắn field hạn chốt. Giới hạn đọc từ capabilities (ở đây hạ `optionsMax` còn 3
 * để test biên gọn), form là RHF + Zod THẬT, service mock.
 */
jest.mock('@/core/socket', () => ({ ...jest.requireActual('@/core/socket'), useConnectionState: jest.fn() }));
jest.mock('@/shell/capabilities', () => ({
  useCapabilities: () => ({ data: { limits: { poll: { optionsMax: 3 } } } }),
  useFeature: () => true,
}));
jest.mock('../api/poll.service', () => ({ pollService: { create: jest.fn() } }));

const service = jest.mocked(pollService);

async function renderSheet() {
  const onClose = jest.fn();
  await renderWithProviders(<CreatePollSheet scope={SCOPE} visible onClose={onClose} />);
  return { onClose };
}
const type = (placeholder: string, text: string) => fireEvent.changeText(screen.getByPlaceholderText(placeholder), text);
const fillValid = async () => {
  await type('Bạn muốn hỏi điều gì?', 'Đi ăn ở đâu?');
  await type('Lựa chọn 1', 'Phở');
  await type('Lựa chọn 2', 'Bún');
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useConnectionState).mockReturnValue('connected');
  service.create.mockResolvedValue({ id: 'msg-new' } as never);
});

describe('CreatePollSheet — lựa chọn', () => {
  it('mở ra có 2 dòng lựa chọn, KHÔNG có nút xoá (đã chạm sàn optionsMin) và có nút "Thêm lựa chọn"', async () => {
    await renderSheet();

    expect(screen.getByPlaceholderText('Lựa chọn 1')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('Lựa chọn 2')).toBeOnTheScreen();
    expect(screen.queryByLabelText(/^Xoá lựa chọn/)).toBeNull();
    expect(screen.getByText('Lựa chọn (2/3)')).toBeOnTheScreen();
  });

  it('thêm tới optionsMax (3) → ẩn nút thêm; xoá bớt → nút thêm quay lại và xoá bị ẩn khi về sàn', async () => {
    await renderSheet();

    await fireEvent.press(screen.getByText('Thêm lựa chọn'));

    expect(screen.getByPlaceholderText('Lựa chọn 3')).toBeOnTheScreen();
    expect(screen.queryByText('Thêm lựa chọn')).toBeNull(); // chạm trần
    await fireEvent.press(screen.getByLabelText('Xoá lựa chọn 3'));
    expect(screen.getByText('Thêm lựa chọn')).toBeOnTheScreen();
    expect(screen.queryByLabelText(/^Xoá lựa chọn/)).toBeNull();
  });
});

describe('CreatePollSheet — kiểm dữ liệu trước khi gửi', () => {
  it('thiếu câu hỏi và lựa chọn → KHÔNG gọi API, lỗi hiện đúng ô', async () => {
    await renderSheet();

    await fireEvent.press(screen.getByText('Tạo'));

    expect(await screen.findByText('Hãy nhập câu hỏi')).toBeOnTheScreen();
    expect(screen.getAllByText('Hãy nhập lựa chọn')).toHaveLength(2);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('lựa chọn TRÙNG (bỏ dấu, hoa/thường) → không gửi, báo trùng ở dòng sau', async () => {
    await renderSheet();
    await type('Bạn muốn hỏi điều gì?', 'Câu hỏi');
    await type('Lựa chọn 1', 'Có');
    await type('Lựa chọn 2', ' co ');

    await fireEvent.press(screen.getByText('Tạo'));

    expect(await screen.findByText('Lựa chọn này bị trùng')).toBeOnTheScreen();
    expect(service.create).not.toHaveBeenCalled();
  });
});

describe('CreatePollSheet — gửi', () => {
  it('hợp lệ → POST với câu hỏi/lựa chọn/multi/anonymous + clientMessageId UUID, rồi đóng tấm', async () => {
    const { onClose } = await renderSheet();
    await fillValid();
    await fireEvent.press(screen.getByText('Cho chọn nhiều'));
    await fireEvent.press(screen.getByText('Ẩn danh'));

    await fireEvent.press(screen.getByText('Tạo'));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    await flushQuery();
    const [scope, input] = service.create.mock.calls[0]!;
    expect(scope).toMatchObject({ scopeId: 'ch-1', scopeType: 'CHANNEL' });
    expect(input).toMatchObject({ anonymous: true, multi: true, options: ['Phở', 'Bún'], question: 'Đi ăn ở đâu?' });
    expect(input.clientMessageId).toMatch(/^[0-9a-f-]{36}$/);
    expect(input).not.toHaveProperty('closesAt');
  });

  it('mô tả "Ẩn danh" nói rõ không ai thấy, kể cả người tạo', async () => {
    await renderSheet();
    expect(screen.getByText('Không ai thấy bạn chọn gì, kể cả người tạo')).toBeOnTheScreen();
  });

  it('bấm hai lần (thử lại sau lỗi) DÙNG LẠI cùng clientMessageId → BE replay, không sinh hai khảo sát', async () => {
    service.create.mockRejectedValueOnce(apiError(400, 'POLL_001'));
    await renderSheet();
    await fillValid();

    await fireEvent.press(screen.getByText('Tạo'));
    expect(await screen.findByText(/Khảo sát cần đủ số lựa chọn/)).toBeOnTheScreen(); // lỗi ở lại TRONG tấm
    await fireEvent.press(screen.getByText('Tạo'));

    await waitFor(() => expect(service.create).toHaveBeenCalledTimes(2));
    expect(service.create.mock.calls[1]![1].clientMessageId).toBe(service.create.mock.calls[0]![1].clientMessageId);
    await flushQuery();
  });

  it('bật "Đặt hạn chốt" → hiện ô ngày/giờ với mặc định sáng mai 09:00; POLL_002 từ BE hiện dưới ô giờ', async () => {
    service.create.mockRejectedValue(apiError(400, 'POLL_002'));
    await renderSheet();
    await fillValid();

    await fireEvent.press(screen.getByText('Đặt hạn chốt'));

    expect(screen.getByLabelText(/^Giờ, 09:00$/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Tạo'));
    expect(await screen.findByText('Hạn kết thúc phải ở tương lai và trong giới hạn cho phép')).toBeOnTheScreen();
    expect(service.create.mock.calls[0]![1].closesAt).toEqual(expect.any(String));
    await flushQuery();
  });

  it('ngoại tuyến → nút "Kết nối lại để gửi" bị khoá, KHÔNG gửi', async () => {
    jest.mocked(useConnectionState).mockReturnValue('offline');
    await renderSheet();
    await fillValid();

    await fireEvent.press(screen.getByText('Kết nối lại để gửi'));

    expect(service.create).not.toHaveBeenCalled();
  });
});
