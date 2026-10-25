import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { WorkspaceSearchScreen } from '../screens/WorkspaceSearchScreen';
import {
  EMPTY_PAGE,
  filePage,
  makeFileHit,
  makeMessageHit,
  messagePage,
  renderWithProviders,
} from './fixtures';
import { mockedHead, mockedSearch, resetScreenMocks, sleep, typeQuery } from './screen-harness';

/**
 * Màn "Tìm toàn workspace" (app.md p5-04 §8) — ô tìm và tab: không gọi API khi từ khoá < 2 ký tự · debounce IME · đổi tab giữ từ
 * khoá · đếm "30+" · khách không có tab Người. Cùng màn, các file cạnh nhau: bộ lọc `.filters` · lỗi/trạng thái `.errors` ·
 * rỗng `.empty` · chọn người gửi/phạm vi `.pickers` + `.scope` · mở tin `.open` · mở tệp/kênh/người/cuộc họp `.results` · tìm gần
 * đây `.recents` · máy tính bảng `.tablet` (đều `WorkspaceSearchScreen.<tên>.test.tsx`). Đồ dùng chung: `screen-harness.ts`
 * (⚠️ `jest.mock` phải nằm trong từng file).
 */

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ wsId: 'ws-1' })),
}));
jest.mock('@shopify/flash-list', () => ({
  FlashList: jest.requireActual('react-native').FlatList,
}));
jest.mock('@/shell/capabilities', () => ({
  FeatureOffScreen: () => null,
  useCapabilities: () => ({ data: undefined }),
  useFeature: jest.fn(() => true),
}));
jest.mock('@/shared/theme', () => ({
  ...jest.requireActual('@/shared/theme'),
  useBreakpoint: jest.fn(),
}));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('@/core/socket', () => ({
  ...jest.requireActual('@/core/socket'),
  useConnectionState: jest.fn(),
}));
jest.mock('../api/workspace-search.service', () => ({
  workspaceSearchService: {
    getWorkspaceHead: jest.fn(),
    joinChannel: jest.fn(),
    listAuthors: jest.fn(),
    listScopes: jest.fn(),
    search: jest.fn(),
  },
}));

beforeEach(resetScreenMocks);

describe('WorkspaceSearchScreen — ô tìm', () => {
  it('chưa gõ gì: KHÔNG gọi API, hiện gợi ý nhập', async () => {
    await renderWithProviders(<WorkspaceSearchScreen />);
    await sleep(400);

    expect(mockedSearch).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Nhập từ khoá để tìm tin nhắn, tệp, kênh, người hoặc cuộc họp/),
    ).toBeOnTheScreen();
  });

  it('gõ 1 ký tự KHÔNG gọi API, chỉ gợi ý "Nhập ít nhất 2 ký tự"', async () => {
    await renderWithProviders(<WorkspaceSearchScreen />);

    await typeQuery('a');
    await sleep(550);

    expect(mockedSearch).not.toHaveBeenCalled();
    expect(screen.getByText('Nhập ít nhất 2 ký tự.')).toBeOnTheScreen();
  });

  it('chỉ có khoảng trắng / khoảng trắng bao quanh 1 ký tự vẫn KHÔNG gọi API (đếm sau khi gọn)', async () => {
    await renderWithProviders(<WorkspaceSearchScreen />);

    await typeQuery('   a   ');
    await sleep(550);

    expect(mockedSearch).not.toHaveBeenCalled();
  });

  it('gõ dồn dập / đang ghép dấu Telex ("d" → "đồ" → "đồ án"): chỉ MỘT lượt gọi với chuỗi cuối, đã gọn khoảng trắng', async () => {
    await renderWithProviders(<WorkspaceSearchScreen />);

    for (const partial of ['d', 'dô', 'đồ', 'đồ ', 'đồ  a', '  đồ   án ']) {
      await typeQuery(partial);
      await sleep(60);
    }
    await waitFor(() => expect(mockedSearch).toHaveBeenCalledTimes(1), { timeout: 2000 });

    expect(mockedSearch).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({ q: 'đồ án', type: 'messages' }),
    );
  });

  it('quá 8 từ bị chặn ở client — không gọi API', async () => {
    await renderWithProviders(<WorkspaceSearchScreen />);

    await typeQuery('a1 b2 c3 d4 e5 f6 g7 h8 i9');
    await sleep(550);

    expect(mockedSearch).not.toHaveBeenCalled();
    expect(screen.getByText('Từ khoá có quá nhiều từ, hãy rút gọn.')).toBeOnTheScreen();
  });
});

describe('WorkspaceSearchScreen — tab', () => {
  it('đổi tab GIỮ từ khoá: gọi lại với cùng q nhưng type mới, ô nhập không bị dựng lại', async () => {
    mockedSearch.mockImplementation(async (_ws, params) =>
      params.type === 'files' ? filePage([makeFileHit()]) : messagePage([makeMessageHit()]),
    );
    await renderWithProviders(<WorkspaceSearchScreen />);
    await typeQuery('đồ án');
    expect(await screen.findByText('Nguyễn Văn An', {}, { timeout: 2000 })).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('tab', { name: /^Tệp/ }));

    await waitFor(() =>
      expect(mockedSearch).toHaveBeenLastCalledWith(
        'ws-1',
        expect.objectContaining({ q: 'đồ án', type: 'files' }),
      ),
    );
    expect(await screen.findByText('de-cuong.pdf')).toBeOnTheScreen();
    // Số đếm của tab Tin nhắn còn nguyên (đọc từ cache, không gọi lại).
    expect(screen.getByRole('tab', { name: /^Tin nhắn, có kết quả/ })).toBeOnTheScreen();
  });

  it('còn trang sau: tab hiện "30+" (BE không đếm chính xác), nhãn trợ năng kèm "có kết quả"', async () => {
    const hits = Array.from({ length: 30 }, (_, index) =>
      makeMessageHit({ highlights: [], messageId: `m-${index}`, snippet: `tin ${index}` }),
    );
    mockedSearch.mockResolvedValue(messagePage(hits, { hasMore: true, nextCursor: 'cursor-2' }));
    await renderWithProviders(<WorkspaceSearchScreen />);

    await typeQuery('đồ án');

    expect(await screen.findByText('Tin nhắn 30+', {}, { timeout: 2000 })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Tin nhắn, có kết quả, 30 trở lên' })).toBeOnTheScreen();
  });

  it('hết trang: đếm số thật ("Tin nhắn 2"); không kết quả: nhãn trợ năng "không có kết quả"', async () => {
    mockedSearch.mockImplementation(async (_ws, params) =>
      params.type === 'messages'
        ? messagePage([makeMessageHit({ messageId: 'm-1' }), makeMessageHit({ messageId: 'm-2' })])
        : EMPTY_PAGE,
    );
    await renderWithProviders(<WorkspaceSearchScreen />);
    await typeQuery('đồ án');
    expect(await screen.findByText('Tin nhắn 2', {}, { timeout: 2000 })).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('tab', { name: /^Tệp/ }));

    expect(
      await screen.findByRole('tab', { name: 'Tệp, không có kết quả' }, { timeout: 2000 }),
    ).toBeOnTheScreen();
    expect(await screen.findByText('Không tìm thấy tệp')).toBeOnTheScreen();
  });

  it('KHÁCH không có tab "Người"; thành viên thì có', async () => {
    mockedHead.mockResolvedValue({ myRole: 'GUEST', status: 'ACTIVE' });
    const guest = await renderWithProviders(<WorkspaceSearchScreen />);
    await waitFor(() => expect(mockedHead).toHaveBeenCalled());
    await sleep(50);

    expect(screen.getByRole('tab', { name: 'Tin nhắn' })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Cuộc họp' })).toBeOnTheScreen();
    expect(screen.queryByRole('tab', { name: 'Người' })).toBeNull();
    await guest.unmount();

    mockedHead.mockResolvedValue({ myRole: 'MEMBER', status: 'ACTIVE' });
    await renderWithProviders(<WorkspaceSearchScreen />);
    expect(await screen.findByRole('tab', { name: 'Người' })).toBeOnTheScreen();
  });
});
