import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { BackHandler } from 'react-native';

import { studyService } from '../api/study.service';
import { QuickQuizScreen } from '../screens/QuickQuizScreen';
import { makeItem, makeSet } from './fixtures';
import { makeQuizItems } from './quick-quiz-fixtures';
import { apiError, renderWithProviders } from './render-helpers';

/** Quiz nhanh — trạng thái dữ liệu (lỗi + thử lại, bộ không có câu chấm được) và THOÁT giữa chừng (nút quay lại + phím Back cứng đều hỏi xác nhận). */
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: () => true,
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ setId: 's1' })),
}));
jest.mock('../api/study.service', () => ({
  studyService: { get: jest.fn(), items: jest.fn(), workspaceAccess: jest.fn() },
}));

const study = jest.mocked(studyService);
const press = (name: string | RegExp, role: 'button' | 'radio' = 'button') =>
  fireEvent.press(screen.getByRole(role, { name }));

beforeEach(() => {
  jest.clearAllMocks();
  study.get.mockResolvedValue(makeSet());
  study.items.mockResolvedValue({ items: makeQuizItems(), setVersion: 3 });
});

describe('trạng thái dữ liệu', () => {
  it('lỗi tải ⇒ báo rõ + "Thử lại" gọi lại API', async () => {
    study.items.mockRejectedValueOnce(apiError(500, 'SYS_500'));
    await renderWithProviders(<QuickQuizScreen />);

    expect(await screen.findByText('Không mở được bộ học')).toBeOnTheScreen();
    await press('Thử lại');

    expect(await screen.findByRole('button', { name: 'Bắt đầu' })).toBeOnTheScreen();
    expect(study.items).toHaveBeenCalledTimes(2);
  });

  it('bộ chỉ có thẻ ghi nhớ ⇒ trạng thái rỗng rõ ràng, tác giả có lối "Thêm câu hỏi", ai cũng có "Về bộ học"', async () => {
    study.items.mockResolvedValue({ items: [makeItem({ id: 'c1' })], setVersion: 1 });
    await renderWithProviders(<QuickQuizScreen />);

    expect(await screen.findByText('Chưa có câu để làm Quiz')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Bắt đầu' })).toBeNull();
    await press('Thêm câu hỏi');
    expect(router.push).toHaveBeenCalledWith({
      params: { setId: 's1' },
      pathname: '/study/sets/[setId]/edit',
    });
    await press('Về bộ học');
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('bộ rỗng và người xem KHÔNG có quyền sửa ⇒ không có nút "Thêm câu hỏi"', async () => {
    study.get.mockResolvedValue(
      makeSet({ myPermissions: { ...makeSet().myPermissions, edit: false } }),
    );
    study.items.mockResolvedValue({ items: [], setVersion: 1 });
    await renderWithProviders(<QuickQuizScreen />);

    expect(await screen.findByText('Chưa có câu để làm Quiz')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Thêm câu hỏi' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Về bộ học' })).toBeOnTheScreen();
  });
});

describe('thoát giữa chừng', () => {
  async function startPlaying() {
    await renderWithProviders(<QuickQuizScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Bắt đầu' }));
  }
  /** Lấy trình xử lý phím Back cứng mới nhất mà màn đã đăng ký. */
  async function pressHardwareBack(spy: jest.SpyInstance): Promise<boolean> {
    const handler = spy.mock.calls.at(-1)?.[1] as (() => boolean) | undefined;
    let handled = false;
    await act(async () => {
      handled = handler?.() ?? false;
    });
    return handled;
  }

  it('đang thiết lập: nút quay lại rời NGAY, không hỏi', async () => {
    await renderWithProviders(<QuickQuizScreen />);
    await screen.findByRole('button', { name: 'Bắt đầu' });
    await press('Quay lại');

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Thoát Quiz nhanh?')).toBeNull();
  });

  it('đang làm bài: nút quay lại hỏi xác nhận; "Ở lại" giữ nguyên, "Thoát" mới rời', async () => {
    await startPlaying();
    await press('Quay lại');

    expect(await screen.findByText('Thoát Quiz nhanh?')).toBeOnTheScreen();
    expect(screen.getByText(/Tiến độ của lượt này sẽ mất/)).toBeOnTheScreen();
    expect(router.back).not.toHaveBeenCalled();

    await press('Ở lại');
    expect(router.back).not.toHaveBeenCalled();
    expect(screen.getByText('1 / 4')).toBeOnTheScreen();

    await press('Quay lại');
    await press('Thoát');
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('đang làm bài: phím Back CỨNG bị chặn và hiện hộp thoại; ở thiết lập thì để hệ điều hành lùi', async () => {
    const spy = jest.spyOn(BackHandler, 'addEventListener');
    await renderWithProviders(<QuickQuizScreen />);
    await screen.findByRole('button', { name: 'Bắt đầu' });
    expect(spy).not.toHaveBeenCalledWith('hardwareBackPress', expect.any(Function));

    await press('Bắt đầu');

    expect(await pressHardwareBack(spy)).toBe(true);
    expect(await screen.findByText('Thoát Quiz nhanh?')).toBeOnTheScreen();
    spy.mockRestore();
  });
});
