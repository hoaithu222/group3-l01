import { fireEvent, screen, within } from '@testing-library/react-native';

import { studyService } from '../api/study.service';
import { StudySetCard } from '../components/StudySetCard';
import { StudySetList } from '../components/StudySetList';
import { Text } from 'react-native';
import { makeSetSummary } from './home-fixtures';
import { renderWithProviders } from './render-helpers';

/**
 * Thẻ bộ học (ô bìa + tiêu đề + viên số liệu + thẻ #tag) và danh sách bộ với `header` cuộn cùng danh sách. Nhãn trợ năng của thẻ giữ nguyên khuôn
 * `"<tiêu đề>, <n> mục, <phạm vi>[, đã bị ẩn]"` (trình đọc màn hình đọc MỘT câu cho cả thẻ); mọi thông tin quan trọng đều bằng CHỮ, không chỉ màu.
 */
jest.mock('@shopify/flash-list', () => ({
  FlashList: jest.requireActual('react-native').FlatList,
}));
jest.mock('../api/study.service', () => ({ studyService: { list: jest.fn() } }));

const study = jest.mocked(studyService);
const PAGE = { hasMore: false, limit: 30, nextCursor: null };

beforeEach(() => jest.clearAllMocks());

describe('StudySetCard', () => {
  it('hiện tiêu đề, số mục, phạm vi (icon + CHỮ) và thẻ #tag; chạm ⇒ onPress nhận đúng bộ', async () => {
    const onPress = jest.fn();
    const set = makeSetSummary({ itemCount: 12, tags: ['toán', 'lý'], visibility: 'PUBLIC' });
    await renderWithProviders(<StudySetCard set={set} onPress={onPress} />);

    expect(screen.getByText('Bộ học thử')).toBeOnTheScreen();
    expect(screen.getByText('12 mục')).toBeOnTheScreen();
    expect(screen.getByText('Công khai')).toBeOnTheScreen();
    expect(screen.getByText('#toán')).toBeOnTheScreen();
    expect(screen.getByText('#lý')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Bộ học thử, 12 mục, Công khai'));
    expect(onPress).toHaveBeenCalledWith(set);
  });

  it('nhiều hơn 3 thẻ ⇒ chỉ hiện 3 và gộp phần còn lại thành "+N" (hàng không biến thành ba dòng chip)', async () => {
    const set = makeSetSummary({ tags: ['a', 'b', 'c', 'd', 'e'] });
    await renderWithProviders(<StudySetCard set={set} onPress={jest.fn()} />);

    expect(screen.getByText('#a')).toBeOnTheScreen();
    expect(screen.getByText('#c')).toBeOnTheScreen();
    expect(screen.queryByText('#d')).toBeNull();
    expect(screen.getByText('+2')).toBeOnTheScreen();
  });

  it('không có thẻ ⇒ không vẽ hàng thẻ', async () => {
    await renderWithProviders(
      <StudySetCard set={makeSetSummary({ tags: [] })} onPress={jest.fn()} />,
    );

    expect(screen.queryByText(/^#/)).toBeNull();
    expect(screen.queryByText(/^\+\d/)).toBeNull();
  });

  it('"Khám phá" (showOwner) ⇒ hiện tác giả; "Của tôi" thì không', async () => {
    const set = makeSetSummary({ owner: { id: 'u2', name: 'Cô Lan' } });
    const { rerender } = await renderWithProviders(
      <StudySetCard set={set} showOwner onPress={jest.fn()} />,
    );
    expect(screen.getByText('Bởi Cô Lan')).toBeOnTheScreen();

    await rerender(<StudySetCard set={set} onPress={jest.fn()} />);
    expect(screen.queryByText('Bởi Cô Lan')).toBeNull();
  });

  it('bộ bị ẩn ⇒ ghi "Đã bị ẩn" bằng chữ ở cả viên lẫn nhãn trợ năng (không chỉ đổi màu icon)', async () => {
    await renderWithProviders(
      <StudySetCard set={makeSetSummary({ status: 'HIDDEN' })} onPress={jest.fn()} />,
    );

    expect(screen.getByText('Đã bị ẩn')).toBeOnTheScreen();
    expect(screen.queryByText('Riêng tư')).toBeNull();
    expect(screen.getByLabelText('Bộ học thử, 2 mục, Riêng tư, đã bị ẩn')).toBeOnTheScreen();
  });

  it('chưa có ảnh bìa ⇒ ô gradient mang chữ cái đầu của bộ (trang trí, ẩn khỏi trình đọc màn hình); có ảnh ⇒ không vẽ ô đó', async () => {
    const { rerender } = await renderWithProviders(
      <StudySetCard set={makeSetSummary({ title: 'đề cương Sử' })} onPress={jest.fn()} />,
    );
    const tile = screen.getByTestId('set-initial-tile', { includeHiddenElements: true });
    expect(within(tile).getByText('Đ', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId('set-initial-tile')).toBeNull();

    await rerender(
      <StudySetCard
        set={makeSetSummary({ coverThumbUrl: 'https://cdn.example/t.jpg' })}
        onPress={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('set-initial-tile', { includeHiddenElements: true })).toBeNull();
  });
  it('có ảnh bìa hay không, thẻ vẫn đủ chữ và bấm được (ô bìa chỉ là trang trí, ẩn khỏi trình đọc màn hình)', async () => {
    const onPress = jest.fn();
    await renderWithProviders(
      <StudySetCard
        set={makeSetSummary({ coverThumbUrl: 'https://cdn.example/t.jpg' })}
        onPress={onPress}
      />,
    );

    await fireEvent.press(screen.getByRole('button', { name: /^Bộ học thử/ }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('StudySetList — header và trạng thái nằm TRONG danh sách', () => {
  const props = {
    emptyDescription: 'Mô tả rỗng',
    emptyTitle: 'Chưa có bộ',
    onOpen: jest.fn(),
    params: { scope: 'mine' as const },
  };
  const header = <Text>KHỐI ĐẦU</Text>;

  it('có dữ liệu ⇒ header rồi tới các thẻ', async () => {
    study.list.mockResolvedValue({ items: [makeSetSummary()], meta: PAGE });
    await renderWithProviders(<StudySetList {...props} header={header} />);

    expect(await screen.findByLabelText(/^Bộ học thử/)).toBeOnTheScreen();
    expect(screen.getByText('KHỐI ĐẦU')).toBeOnTheScreen();
  });

  it('đang tải ⇒ header + khung xương có nhãn "Đang tải…" (busy)', async () => {
    study.list.mockReturnValue(new Promise(() => undefined));
    await renderWithProviders(<StudySetList {...props} header={header} />);

    expect(screen.getByText('KHỐI ĐẦU')).toBeOnTheScreen();
    expect(screen.getByLabelText('Đang tải…')).toBeBusy();
  });

  it('lỗi ⇒ header vẫn còn + "Thử lại" gọi lại API', async () => {
    study.list
      .mockRejectedValueOnce(new Error('mạng'))
      .mockResolvedValue({ items: [makeSetSummary()], meta: PAGE });
    await renderWithProviders(<StudySetList {...props} header={header} />);

    expect(await screen.findByText('Không tải được danh sách bộ học')).toBeOnTheScreen();
    expect(screen.getByText('KHỐI ĐẦU')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByLabelText(/^Bộ học thử/)).toBeOnTheScreen();
  });

  it('mất mạng (không có phản hồi) ⇒ trạng thái "ngoại tuyến" chung của bộ, không phải câu lỗi máy chủ; header vẫn còn', async () => {
    study.list.mockRejectedValue(Object.assign(new Error('Network Error'), { isAxiosError: true }));
    await renderWithProviders(<StudySetList {...props} header={header} />);

    expect(await screen.findByText('Bạn đang ngoại tuyến')).toBeOnTheScreen();
    expect(screen.getByText('Kiểm tra kết nối mạng rồi thử lại.')).toBeOnTheScreen();
    expect(screen.queryByText('Không tải được danh sách bộ học')).toBeNull();
    expect(screen.getByText('KHỐI ĐẦU')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeOnTheScreen();
  });

  it('rỗng ⇒ header vẫn còn + trạng thái rỗng do nơi gọi khai', async () => {
    study.list.mockResolvedValue({ items: [], meta: PAGE });
    await renderWithProviders(<StudySetList {...props} header={header} />);

    expect(await screen.findByText('Chưa có bộ')).toBeOnTheScreen();
    expect(screen.getByText('KHỐI ĐẦU')).toBeOnTheScreen();
  });

  it('không truyền header ⇒ danh sách chạy như cũ (màn nhóm)', async () => {
    study.list.mockResolvedValue({ items: [], meta: PAGE });
    await renderWithProviders(<StudySetList {...props} />);

    expect(await screen.findByText('Chưa có bộ')).toBeOnTheScreen();
    expect(screen.queryByText('KHỐI ĐẦU')).toBeNull();
  });
});
