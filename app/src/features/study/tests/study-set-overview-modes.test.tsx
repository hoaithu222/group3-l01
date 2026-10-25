import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';

import { useFeature } from '@/shell/capabilities';

import { srService } from '../api/sr.service';
import { studyService } from '../api/study.service';
import { SetOverviewScreen } from '../screens/SetOverviewScreen';
import { makeChoiceItem, makeItem, makeSet } from './fixtures';
import { apiError, renderWithProviders } from './render-helpers';

/**
 * Tổng quan bộ dạng HERO (bìa/mảng màu + tiêu đề + tác giả + viên số liệu theo loại mục) và khối "Luyện tập" dạng Ô theo `STUDY_MODE_META`:
 * nút chính "Học thẻ" (rung nhẹ) + Ôn theo lịch · Quiz nhanh (khi bộ có câu chấm được) · Thi thử · Lịch sử thi thử · Tổ chức thi trực tiếp (cờ `live-quiz`). Quyền/điều kiện hiện có
 * (banner "Đã bị ẩn", bộ rỗng, hai lần bấm "Ôn theo lịch") giữ nguyên — phần quyền ở `study-set-overview.test.tsx`.
 */
// Các khối vào màn (`EnterView`) dùng layout animation của Reanimated — bật "Giảm chuyển động" để test xác định (không có `entering`).
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: () => true,
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ setId: 's1' })),
}));
jest.mock('@/shell/capabilities', () => ({
  useCapabilities: () => ({ data: undefined }),
  useFeature: jest.fn(() => true),
}));
jest.mock('../api/study.service', () => ({
  studyService: { get: jest.fn(), items: jest.fn(), workspaceAccess: jest.fn() },
}));
jest.mock('../api/sr.service', () => ({
  ...jest.requireActual('../api/sr.service'),
  srService: { enroll: jest.fn(), unenroll: jest.fn() },
}));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

const study = jest.mocked(studyService);
const sr = jest.mocked(srService);
const flag = jest.mocked(useFeature);

beforeEach(() => {
  jest.clearAllMocks();
  flag.mockReturnValue(true);
  study.get.mockResolvedValue(
    makeSet({ owner: { id: 'u2', name: 'Cô Lan' }, tags: ['toán', 'lớp 9'] }),
  );
  study.items.mockResolvedValue({
    items: [
      makeItem({ id: 'i1', order: 1 }),
      makeItem({ id: 'i3', order: 3 }),
      makeChoiceItem({ id: 'i2', order: 2 }),
    ],
    setVersion: 3,
  });
  sr.enroll.mockResolvedValue({ enrolledItems: 3, newPerDay: 10, setId: 's1' });
});

describe('SetOverviewScreen — hero', () => {
  it('tiêu đề chỉ MỘT lần (bìa là trang trí); tác giả, ngày cập nhật, số mục, phạm vi và thẻ #tag đều bằng chữ', async () => {
    await renderWithProviders(<SetOverviewScreen />);

    expect(await screen.findAllByText('Bộ học thử')).toHaveLength(1);
    expect(screen.getByText(/Cô Lan · cập nhật 20\/09\/2026/)).toBeOnTheScreen();
    expect(screen.getByText('Mô tả bộ')).toBeOnTheScreen();
    expect(screen.getByText('2 mục')).toBeOnTheScreen();
    expect(screen.getByText('Riêng tư')).toBeOnTheScreen();
    expect(screen.getByText('#toán')).toBeOnTheScreen();
    expect(screen.getByText('#lớp 9')).toBeOnTheScreen();
  });

  it('mục đã tải ⇒ viên số mục THEO LOẠI (đếm từ danh sách mục thật)', async () => {
    await renderWithProviders(<SetOverviewScreen />);

    expect(await screen.findByText('Thẻ ghi nhớ: 2')).toBeOnTheScreen();
    expect(screen.getByText('Trắc nghiệm: 1')).toBeOnTheScreen();
  });

  it('bộ bị ẩn ⇒ banner "Đã bị ẩn do vi phạm" vẫn nằm trên hero, kèm lý do', async () => {
    study.get.mockResolvedValue(makeSet({ hiddenReason: 'Vi phạm bản quyền', status: 'HIDDEN' }));
    await renderWithProviders(<SetOverviewScreen />);

    expect(await screen.findByText('Đã bị ẩn do vi phạm')).toBeOnTheScreen();
    expect(screen.getByText('Vi phạm bản quyền')).toBeOnTheScreen();
    expect(screen.getByText('Bộ học thử')).toBeOnTheScreen();
  });

  it('bộ chưa có mục ⇒ hero + "Bộ chưa có mục" (tác giả có nút "Thêm mục"), KHÔNG có nút "Học thẻ"/ô luyện tập', async () => {
    study.get.mockResolvedValue(makeSet({ itemCount: 0 }));
    study.items.mockResolvedValue({ items: [], setVersion: 3 });
    await renderWithProviders(<SetOverviewScreen />);

    expect(await screen.findByText('Bộ chưa có mục')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Thêm mục' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Học thẻ' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Thi thử' })).toBeNull();
  });
});

describe('SetOverviewScreen — nút chính và ô luyện tập', () => {
  it('"Học thẻ" là nút chính: rung nhẹ rồi mở màn học thẻ của bộ', async () => {
    await renderWithProviders(<SetOverviewScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Học thẻ' }));

    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    expect(router.push).toHaveBeenCalledWith({
      params: { setId: 's1' },
      pathname: '/study/sets/[setId]/flashcards',
    });
  });

  it('năm ô luyện tập là nút có nhãn chữ, mỗi ô mở đúng đích', async () => {
    await renderWithProviders(<SetOverviewScreen />);
    await screen.findByRole('button', { name: 'Học thẻ' });

    await fireEvent.press(screen.getByRole('button', { name: 'Quiz nhanh' }));
    expect(router.push).toHaveBeenLastCalledWith({
      params: { setId: 's1' },
      pathname: '/study/sets/[setId]/quiz',
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Thi thử' }));
    expect(router.push).toHaveBeenLastCalledWith({
      params: { setId: 's1' },
      pathname: '/study/sets/[setId]/mock',
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Lịch sử thi thử' }));
    expect(router.push).toHaveBeenLastCalledWith({
      params: { setId: 's1' },
      pathname: '/study/history',
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Tổ chức thi trực tiếp' }));
    expect(router.push).toHaveBeenLastCalledWith({
      params: { setId: 's1' },
      pathname: '/study/live/host',
    });
  });

  it('"Ôn theo lịch": đăng ký cả bộ rồi mở /study/sr?setId= — ô khoá lúc đang đăng ký (không đăng ký hai lượt)', async () => {
    let finish: () => void = () => undefined;
    sr.enroll.mockReturnValue(
      new Promise((resolve) => {
        finish = () => resolve({ enrolledItems: 3, newPerDay: 10, setId: 's1' });
      }),
    );
    await renderWithProviders(<SetOverviewScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Ôn theo lịch' }));

    expect(await screen.findByText('Đang đăng ký ôn…')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Ôn theo lịch' })).toBeBusy();
    await fireEvent.press(screen.getByRole('button', { name: 'Ôn theo lịch' }));
    expect(sr.enroll).toHaveBeenCalledTimes(1);

    finish();
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({ params: { setId: 's1' }, pathname: '/study/sr' }),
    );
  });

  it('đăng ký ôn lỗi ⇒ ô mở khoá lại, không mở màn ôn', async () => {
    sr.enroll.mockRejectedValue(apiError(422, 'SR_002'));
    await renderWithProviders(<SetOverviewScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Ôn theo lịch' }));

    await waitFor(() => expect(sr.enroll).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Ôn theo lịch' })).not.toBeBusy(),
    );
    expect(router.push).not.toHaveBeenCalled();
  });

  it('cờ live-quiz tắt ⇒ không có ô "Tổ chức thi trực tiếp" (còn bốn ô)', async () => {
    flag.mockReturnValue(false);
    await renderWithProviders(<SetOverviewScreen />);
    await screen.findByRole('button', { name: 'Học thẻ' });

    expect(screen.queryByRole('button', { name: 'Tổ chức thi trực tiếp' })).toBeNull();
    for (const name of ['Ôn theo lịch', 'Quiz nhanh', 'Thi thử', 'Lịch sử thi thử']) {
      expect(screen.getByRole('button', { name })).toBeOnTheScreen();
    }
  });
});
