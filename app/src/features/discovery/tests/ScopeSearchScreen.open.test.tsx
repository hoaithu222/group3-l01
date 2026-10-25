import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { showToast } from '@/shared/utils/toast.utils';

import { discoveryService } from '../api/discovery.service';
import { ScopeSearchScreen } from '../screens/ScopeSearchScreen';
import { apiError, makeHit, renderWithProviders, searchPage } from './fixtures';

/**
 * Màn tìm trong kênh/hội thoại (README p1-09 §8) — lỗi `SRCH_*` tại chỗ · mở kết quả đúng route (`?m=`, reply → màn luồng) ·
 * bộ lọc. Ô tìm, kết quả, phân trang: `ScopeSearchScreen.test.tsx`.
 */

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('@shopify/flash-list', () => ({ FlashList: jest.requireActual('react-native').FlatList }));
jest.mock('@/shell/capabilities', () => ({ useCapabilities: () => ({ data: undefined }) }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/discovery.service', () => ({
  discoveryService: { search: jest.fn(), listMembers: jest.fn() },
}));

const mockedSearch = jest.mocked(discoveryService.search);
const CHANNEL = { scopeType: 'CHANNEL', scopeId: 'ch-1', workspaceId: 'ws-1' } as const;
const CONVERSATION = { scopeType: 'CONVERSATION', scopeId: 'cv-1' } as const;

async function typeQuery(text: string) {
  await fireEvent.changeText(screen.getByPlaceholderText('Tìm tin nhắn'), text);
}

beforeEach(() => {
  jest.clearAllMocks();
  // `mockReset` (không chỉ `clearAllMocks`): hàng đợi `mockResolvedValueOnce` chưa dùng hết không được rò sang ca sau.
  mockedSearch.mockReset().mockResolvedValue(searchPage([]));
});

describe('ScopeSearchScreen — lỗi tại chỗ', () => {
  it('SRCH_001 (400): câu tiếng Việt theo mã + "Thử lại", KHÔNG toast trùng', async () => {
    mockedSearch.mockRejectedValue(apiError(400, 'SRCH_001'));
    await renderWithProviders(<ScopeSearchScreen scope={CHANNEL} />);

    await typeQuery('ab');

    expect(await screen.findByText('Từ khoá tìm kiếm cần từ 2 đến 100 ký tự', {}, { timeout: 2000 })).toBeOnTheScreen();
    expect(screen.getByText('Thử lại')).toBeOnTheScreen();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('429 RATE_002: đếm ngược theo retryAfterSeconds, nút "Thử lại" khoá tới khi hết giờ', async () => {
    mockedSearch.mockRejectedValue(apiError(429, 'RATE_002', { retryAfterSeconds: 30 }));
    await renderWithProviders(<ScopeSearchScreen scope={CHANNEL} />);

    await typeQuery('đồ án');

    expect(await screen.findByText(/Tự thử lại sau 30 giây/, {}, { timeout: 2000 })).toBeOnTheScreen();
    expect(screen.getByText('Thử lại')).toBeDisabled();
  });

  it('404 (mất quyền đọc phạm vi): toast trung tính rồi rời màn — không hiện nội dung', async () => {
    mockedSearch.mockRejectedValue(apiError(404, 'PERM_404'));
    await renderWithProviders(<ScopeSearchScreen scope={CHANNEL} />);

    await typeQuery('đồ án');

    await waitFor(() => expect(router.back).toHaveBeenCalled(), { timeout: 2000 });
    expect(showToast).toHaveBeenCalledWith('info', 'Bạn không còn quyền xem nội dung này.');
  });
});

describe('ScopeSearchScreen — mở kết quả', () => {
  it('kênh: hit thường → route kênh + m; reply → màn luồng của TIN GỐC (SAV-05)', async () => {
    mockedSearch.mockResolvedValue(
      searchPage([
        makeHit({ messageId: 'msg-root', snippet: 'tin thường', highlights: [] }),
        makeHit({
          messageId: 'msg-reply',
          snippet: 'tin trả lời',
          highlights: [],
          inThread: true,
          threadId: 'root-1',
          parentMessageId: 'root-1',
        }),
      ]),
    );
    await renderWithProviders(<ScopeSearchScreen scope={CHANNEL} />);
    await typeQuery('tin');

    await fireEvent.press(await screen.findByText('tin thường', {}, { timeout: 2000 }));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/workspaces/[wsId]/channels/[chId]',
      params: { wsId: 'ws-1', chId: 'ch-1', m: 'msg-root' },
    });

    await fireEvent.press(screen.getByText('tin trả lời'));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/workspaces/[wsId]/channels/[chId]/thread/[messageId]',
      params: { wsId: 'ws-1', chId: 'ch-1', messageId: 'root-1', m: 'msg-reply' },
    });
  });

  it('hội thoại: route hội thoại + m', async () => {
    mockedSearch.mockResolvedValue(
      searchPage([makeHit({ messageId: 'm-7', snippet: 'tin hội thoại', highlights: [] })]),
    );
    await renderWithProviders(<ScopeSearchScreen scope={CONVERSATION} />);
    await typeQuery('tin');

    await fireEvent.press(await screen.findByText('tin hội thoại', {}, { timeout: 2000 }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/messages/[conversationId]',
      params: { conversationId: 'cv-1', m: 'm-7' },
    });
  });
});

describe('ScopeSearchScreen — bộ lọc', () => {
  it('chọn loại tệp trong tờ bộ lọc rồi "Áp dụng" → gọi lại với fileKind; hội thoại KHÔNG có công tắc luồng', async () => {
    mockedSearch.mockResolvedValue(searchPage([makeHit()]));
    await renderWithProviders(<ScopeSearchScreen scope={CHANNEL} />);
    await typeQuery('đồ án');
    await waitFor(() => expect(mockedSearch).toHaveBeenCalledTimes(1), { timeout: 2000 });

    await fireEvent.press(screen.getByText('Bộ lọc'));
    expect(await screen.findByText('Bộ lọc tìm kiếm')).toBeOnTheScreen();
    expect(screen.getByText('Gồm tin trả lời trong luồng')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Ảnh'));
    await fireEvent.press(screen.getByText('Áp dụng'));

    await waitFor(() =>
      expect(mockedSearch).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ q: 'đồ án', fileKind: 'IMAGE' }),
      ),
    );
    expect(await screen.findByText('Bộ lọc (1)')).toBeOnTheScreen();
  });

  it('phạm vi hội thoại không có công tắc "Gồm tin trả lời trong luồng"', async () => {
    await renderWithProviders(<ScopeSearchScreen scope={CONVERSATION} />);

    await fireEvent.press(screen.getByText('Bộ lọc'));

    expect(await screen.findByText('Bộ lọc tìm kiếm')).toBeOnTheScreen();
    expect(screen.queryByText('Gồm tin trả lời trong luồng')).toBeNull();
  });
});
