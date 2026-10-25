import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { MODULE_REGISTRY } from '@/shell/navigation/module-registry';
import { useFeature } from '@/shell/capabilities';

import { studyService } from '../api/study.service';
import { CreateSetScreen } from '../screens/CreateSetScreen';
import { FlashcardStudyScreen } from '../screens/FlashcardStudyScreen';
import { makeChoiceItem, makeItem, makeSet } from './fixtures';
import { renderWithProviders } from './render-helpers';

/** Các màn của Học (app.md p4-01 §8): học thẻ, tạo bộ (PUBLIC cần xác nhận), quyền theo `myPermissions`, ẩn theo cờ/GUEST. */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ setId: 's1', wsId: 'ws-1' })),
}));
jest.mock('@shopify/flash-list', () => ({
  FlashList: jest.requireActual('react-native').FlatList,
}));
jest.mock('@/core/socket', () => ({ useConnectionState: () => 'connected' }));
jest.mock('@/shell/capabilities', () => ({
  useCapabilities: () => ({ data: undefined }),
  useFeature: jest.fn(() => true),
}));
jest.mock('../api/study.service', () => ({
  studyService: {
    create: jest.fn(),
    duplicate: jest.fn(),
    get: jest.fn(),
    items: jest.fn(),
    list: jest.fn(),
    popularTags: jest.fn(),
    remove: jest.fn(),
    report: jest.fn(),
    workspaceAccess: jest.fn(),
  },
}));

const mocked = jest.mocked(studyService);
const mockedFeature = jest.mocked(useFeature);
const PAGE = { hasMore: false, limit: 30, nextCursor: null };

beforeEach(() => {
  jest.clearAllMocks();
  mockedFeature.mockReturnValue(true);
  mocked.get.mockResolvedValue(makeSet());
  mocked.items.mockResolvedValue({
    items: [makeItem({ id: 'i1', order: 1 }), makeChoiceItem({ id: 'i2', order: 2 })],
    setVersion: 3,
  });
  mocked.list.mockResolvedValue({ items: [], meta: PAGE });
  mocked.popularTags.mockResolvedValue([]);
  mocked.workspaceAccess.mockResolvedValue({
    id: 'ws-1',
    myRole: 'MEMBER',
    name: 'Nhóm Toán',
    status: 'ACTIVE',
  });
});

describe('module registry', () => {
  it('"study" KHÔNG có tab: là phân hệ phụ (`menu`) trong danh sách chọn phân hệ (README p4-01 §2, D-29)', () => {
    const study = MODULE_REGISTRY.find((module) => module.name === 'study');
    expect(study?.placement).toBe('menu');
  });
});

describe('FlashcardStudyScreen', () => {
  it('lật thẻ, đánh dấu thuộc/chưa thuộc, tóm tắt cuối phiên và học lại thẻ chưa thuộc', async () => {
    await renderWithProviders(<FlashcardStudyScreen />);

    expect(await screen.findByText('Thuật ngữ')).toBeOnTheScreen();
    expect(screen.getByText('1/2')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText(/^Thẻ 1\/2\. Mặt trước/));
    expect(await screen.findByText('Định nghĩa')).toBeOnTheScreen();
    expect(screen.getByText('Mặt sau')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Đã thuộc'));
    expect(await screen.findByText('2/2')).toBeOnTheScreen();
    // Thẻ trắc nghiệm: mặt trước liệt kê lựa chọn A/B.
    expect(screen.getByText('A. Hà Nội')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Chưa thuộc'));
    expect(await screen.findByText('Hoàn thành!')).toBeOnTheScreen();
    // Ô số liệu ở màn tổng kết đọc lên cả nhãn lẫn số ("Đã thuộc: 1 thẻ") — số trần "1" vô nghĩa với trình đọc màn hình.
    expect(screen.getByLabelText('Đã thuộc: 1 thẻ')).toBeOnTheScreen();
    expect(screen.getByLabelText('Chưa thuộc: 1 thẻ')).toBeOnTheScreen();
    expect(screen.getByLabelText('Đã thuộc 1 trên 2 thẻ')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Học lại 1 thẻ chưa thuộc'));
    expect(await screen.findByText('1/1')).toBeOnTheScreen();
    expect(screen.getByText('Thủ đô của Việt Nam?')).toBeOnTheScreen();
  });

  it('"Xáo trộn" là công tắc ở dòng tiến độ; Trước/Sau vẫn có (thay cho vuốt) và "Trước" khoá ở thẻ đầu', async () => {
    await renderWithProviders(<FlashcardStudyScreen />);

    const shuffle = await screen.findByRole('checkbox', { name: 'Xáo trộn' });
    expect(shuffle).not.toBeChecked();
    await fireEvent.press(shuffle);
    expect(screen.getByRole('checkbox', { name: 'Xáo trộn' })).toBeChecked();

    expect(screen.getByLabelText('Thẻ trước')).toBeDisabled();
    await fireEvent.press(screen.getByLabelText('Thẻ sau'));
    expect(screen.getByLabelText('Thẻ trước')).toBeEnabled();
  });

  it('bộ rỗng ⇒ "Bộ chưa có mục", không có điều khiển học', async () => {
    mocked.items.mockResolvedValue({ items: [], setVersion: 3 });
    await renderWithProviders(<FlashcardStudyScreen />);

    expect(await screen.findByText('Bộ chưa có mục')).toBeOnTheScreen();
    expect(screen.queryByText('Đã thuộc')).toBeNull();
  });
});

describe('CreateSetScreen', () => {
  it('Công khai BẮT BUỘC tick xác nhận: chưa tick ⇒ không tạo được; tick rồi gửi confirmPublic + Idempotency-Key', async () => {
    mocked.create.mockResolvedValue(makeSet({ id: 'new-1', visibility: 'PUBLIC' }));
    await renderWithProviders(<CreateSetScreen />);

    await fireEvent.changeText(await screen.findByLabelText(/Tiêu đề/), 'Từ vựng IELTS');
    await fireEvent.press(screen.getByText('Công khai'));
    // "Tạo bộ học" vừa là tiêu đề AppBar vừa là nhãn nút — nút là phần tử cuối.
    await fireEvent.press(screen.getAllByText('Tạo bộ học').at(-1) as never);
    expect(mocked.create).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText('Tôi có quyền chia sẻ nội dung này'));
    await fireEvent.press(screen.getAllByText('Tạo bộ học').at(-1) as never);

    await waitFor(() => expect(mocked.create).toHaveBeenCalledTimes(1));
    const [payload, key] = mocked.create.mock.calls[0] ?? [];
    expect(payload).toMatchObject({
      confirmPublic: true,
      title: 'Từ vựng IELTS',
      visibility: 'PUBLIC',
    });
    expect(String(key)).toMatch(/^study-set-create-/);
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        params: { setId: 'new-1' },
        pathname: '/study/sets/[setId]',
      }),
    );
  });

  it('"Trong nhóm" bị tắt khi không mở từ hub nhóm (thiếu workspaceId ⇒ BE STUDY_003)', async () => {
    await renderWithProviders(<CreateSetScreen />);

    expect(
      await screen.findByText('Mở từ mục "Học" của nhóm để tạo bộ cho nhóm.'),
    ).toBeOnTheScreen();
  });
});
