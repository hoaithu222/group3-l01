import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { mockAttemptsService } from '../api/mock-attempts.service';
import { studyService } from '../api/study.service';
import { MockSetupScreen } from '../screens/MockSetupScreen';
import { makeChoiceItem, makeItem, makeSet } from './fixtures';
import { makeAttempt, makeQuestion } from './mock-fixtures';
import { apiError, renderWithProviders } from './render-helpers';

/** Thiết lập thi thử (README p4-02 §3 `MockSetup`, §8): `MOCK_002` mở `ResumeAttemptDialog`, "Tiếp tục" đi tới lượt cũ. */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ setId: 's1' })),
}));
jest.mock('../api/study.service', () => ({ studyService: { get: jest.fn(), items: jest.fn() } }));
jest.mock('../api/mock-attempts.service', () => ({
  ...jest.requireActual('../api/mock-attempts.service'),
  mockAttemptsService: { create: jest.fn() },
}));

const api = jest.mocked(mockAttemptsService);
const study = jest.mocked(studyService);

/** 3 câu chấm được (2 thẻ chủ đề) + 1 flashcard (KHÔNG tính vào đề). */
const ITEMS = [
  makeChoiceItem({ id: 'c1', tags: ['toan', 'de'] }),
  makeChoiceItem({ id: 'c2', tags: ['toan'] }),
  makeChoiceItem({ id: 'c3', tags: ['ly'] }),
  makeItem({ id: 'f1', tags: ['toan'], type: 'FLASHCARD' }),
];

function createdAttempt() {
  return {
    attempt: makeAttempt({ id: 'a-new' }),
    expiresAt: new Date().toISOString(),
    questions: [makeQuestion(0)],
    serverNow: new Date().toISOString(),
  };
}

/** Render rồi chờ mục của bộ tải xong (mục có thẻ chủ đề ⇒ phần "Chủ đề" hiện) — tránh cập nhật React Query tới SAU khi test kết thúc. */
async function renderLoaded() {
  await renderWithProviders(<MockSetupScreen />);
  await screen.findByText('Chủ đề (tuỳ chọn)');
}

/**
 * Để thông báo cuối của React Query (mutation/truy vấn báo qua `setTimeout(0)`) đáp xuống TRONG `act` — không thì nó tới sau khi test
 * kết thúc và React than "update not wrapped in act". `waitFor` không đủ vì điều kiện (`api.create` đã gọi) đúng TRƯỚC khi thông báo tới.
 */
const settled = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

beforeEach(() => {
  jest.clearAllMocks();
  study.get.mockResolvedValue(makeSet());
  study.items.mockResolvedValue({ items: ITEMS, setVersion: 1 });
});

describe('MockSetupScreen', () => {
  it('MOCK_002 → hộp thoại "Đang có lượt thi dở"; "Tiếp tục làm" điều hướng tới lượt CŨ (không tạo lượt mới)', async () => {
    api.create.mockRejectedValue(apiError(409, 'MOCK_002', { attemptId: 'a-old' }));
    await renderLoaded();
    expect(screen.getByText('Bộ học thử')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Bắt đầu'));
    expect(await screen.findByText('Đang có lượt thi dở')).toBeOnTheScreen();
    expect(router.replace).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Tiếp tục làm'));
    expect(router.replace).toHaveBeenCalledWith({
      params: { attemptId: 'a-old' },
      pathname: '/study/attempts/[attemptId]',
    });
    await settled();
  });

  it('bắt đầu thành công: gửi cấu hình + Idempotency-Key theo lần bấm rồi vào màn làm bài', async () => {
    api.create.mockResolvedValue(createdAttempt());
    await renderLoaded();
    await fireEvent.press(screen.getByText('40 câu'));
    await fireEvent.press(screen.getByText('30 phút'));
    await fireEvent.press(screen.getByText('Bắt đầu'));

    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    await settled();
    const [setId, payload, key] = api.create.mock.calls[0] ?? [];
    expect(setId).toBe('s1');
    // cấu hình mặc định (trộn câu, không chọn chủ đề) giữ đúng hình dạng cũ: BE mặc định `shuffle = true`.
    expect(payload).toEqual({ count: 40, durationSec: 1800 });
    expect(String(key)).toMatch(/^mock-create-/);
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        params: { attemptId: 'a-new' },
        pathname: '/study/attempts/[attemptId]',
      }),
    );
  });
});

describe('ô chọn số câu / thời lượng', () => {
  it('là nhóm radio: ô đang chọn `checked`, chọn ô khác đổi ngay; tóm tắt "Đề của bạn" cập nhật', async () => {
    await renderLoaded();
    expect(screen.getByRole('radio', { name: '20 phút' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '10 câu' })).not.toBeChecked();

    await fireEvent.press(screen.getByRole('radio', { name: '10 phút' }));
    expect(screen.getByRole('radio', { name: '10 phút' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '20 phút' })).not.toBeChecked();
    // chỉ có 3 câu chấm được ⇒ đề 3 câu, 10 phút ⇒ trung bình 200 giây = 3,3 phút mỗi câu
    expect(screen.getByLabelText('Đề của bạn: 3 câu, 10 phút')).toBeOnTheScreen();
    expect(screen.getByText('3,3')).toBeOnTheScreen();
  });

  it('bộ ít câu hơn số đã chọn: nói rõ đề chỉ có bấy nhiêu câu (không hứa 20 câu rồi giao 3)', async () => {
    await renderLoaded();
    expect(screen.getByText('Chỉ có 3 câu chấm được nên đề có 3 câu.')).toBeOnTheScreen();
  });
});

describe('tuỳ chọn trộn câu và chủ đề', () => {
  it('tắt "Trộn câu hỏi và đáp án" ⇒ gửi `shuffle: false`', async () => {
    api.create.mockResolvedValue(createdAttempt());
    await renderLoaded();

    const toggle = screen.getByRole('switch', { name: 'Trộn câu hỏi và đáp án' });
    expect(toggle).toBeChecked();
    await fireEvent.press(toggle);
    expect(screen.getByRole('switch', { name: 'Trộn câu hỏi và đáp án' })).not.toBeChecked();
    expect(screen.getByText('Giữ thứ tự gốc')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Bắt đầu'));
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    await settled();
    expect(api.create.mock.calls[0]?.[1]).toEqual({ count: 20, durationSec: 1200, shuffle: false });
  });

  it('chip chủ đề đếm câu chấm được (flashcard không tính); chọn chủ đề ⇒ gửi `tags` và số câu theo chủ đề', async () => {
    api.create.mockResolvedValue(createdAttempt());
    await renderLoaded();

    expect(screen.getByRole('checkbox', { name: 'toan · 2' })).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Tất cả chủ đề' })).toBeChecked();

    await fireEvent.press(screen.getByRole('checkbox', { name: 'ly · 1' }));
    expect(screen.getByRole('checkbox', { name: 'ly · 1' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Tất cả chủ đề' })).not.toBeChecked();
    expect(screen.getByLabelText('Đề của bạn: 1 câu, 20 phút')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Bắt đầu'));
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    await settled();
    expect(api.create.mock.calls[0]?.[1]).toEqual({ count: 20, durationSec: 1200, tags: ['ly'] });
  });

  it('"Tất cả chủ đề" bỏ hết lựa chọn chủ đề', async () => {
    await renderLoaded();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'de · 1' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Tất cả chủ đề' }));
    expect(screen.getByRole('checkbox', { name: 'de · 1' })).not.toBeChecked();
    expect(screen.getByLabelText('Đề của bạn: 3 câu, 20 phút')).toBeOnTheScreen();
  });
});

describe('khi chưa biết / không có câu chấm được', () => {
  it('bộ chỉ có flashcard: cảnh báo rõ, nhưng KHÔNG chặn bấm "Bắt đầu" (BE quyết: MOCK_001 → toast)', async () => {
    study.items.mockResolvedValue({ items: [makeItem({ id: 'f1' })], setVersion: 1 });
    api.create.mockRejectedValue(apiError(400, 'MOCK_001'));
    await renderWithProviders(<MockSetupScreen />);

    expect(
      await screen.findByText(/chưa có câu trắc nghiệm, Đúng\/Sai hay điền nào/),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Chủ đề (tuỳ chọn)')).toBeNull();
    await fireEvent.press(screen.getByText('Bắt đầu'));
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    await settled();
  });

  it('không tải được mục của bộ: ẩn phần số câu có sẵn/chủ đề, vẫn bắt đầu được với số đã chọn', async () => {
    study.items.mockRejectedValue(new Error('offline'));
    api.create.mockResolvedValue(createdAttempt());
    await renderWithProviders(<MockSetupScreen />);
    expect(await screen.findByText('Bộ học thử')).toBeOnTheScreen();
    await waitFor(() => expect(study.items).toHaveBeenCalledTimes(1));
    // để thông báo lỗi của React Query (setTimeout 0) đáp xuống TRONG act rồi mới kết luận
    await settled();
    expect(screen.getByLabelText('Đề của bạn: 20 câu, 20 phút')).toBeOnTheScreen();
    expect(screen.queryByText('Chủ đề (tuỳ chọn)')).toBeNull();

    await fireEvent.press(screen.getByText('Bắt đầu'));
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    await settled();
    expect(api.create.mock.calls[0]?.[1]).toEqual({ count: 20, durationSec: 1200 });
  });
});
