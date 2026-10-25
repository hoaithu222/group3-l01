import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { discoveryService } from '../api/discovery.service';
import { ScopeSearchScreen } from '../screens/ScopeSearchScreen';
import { makeHit, renderWithProviders, searchPage } from './fixtures';

/**
 * Màn tìm trong kênh/hội thoại (README p1-09 §8) — ô tìm: gõ ≥ 2 ký tự mới gọi API · debounce (IME) · highlight theo UTF-16 ·
 * `partial` · phân trang cursor. Lỗi `SRCH_*`, mở kết quả, bộ lọc: `ScopeSearchScreen.open.test.tsx`.
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

/** Sau nhịp debounce 400 ms của ô tìm — dùng đồng hồ THẬT (waitFor mặc định 1 s không đủ cho ca "không gọi gì"). */
const sleep = (ms: number) => act(async () => void (await new Promise((resolve) => setTimeout(resolve, ms))));

async function typeQuery(text: string) {
  await fireEvent.changeText(screen.getByPlaceholderText('Tìm tin nhắn'), text);
}

beforeEach(() => {
  jest.clearAllMocks();
  // `mockReset` (không chỉ `clearAllMocks`): hàng đợi `mockResolvedValueOnce` chưa dùng hết không được rò sang ca sau.
  mockedSearch.mockReset().mockResolvedValue(searchPage([]));
});

describe('ScopeSearchScreen — ô tìm', () => {
  it('gõ 1 ký tự KHÔNG gọi API, chỉ gợi ý "Nhập ít nhất 2 ký tự"', async () => {
    await renderWithProviders(<ScopeSearchScreen scope={CHANNEL} />);

    await typeQuery('a');
    await sleep(550);

    expect(mockedSearch).not.toHaveBeenCalled();
    expect(screen.getByText('Nhập ít nhất 2 ký tự.')).toBeOnTheScreen();
  });

  it('gõ dồn dập / đang ghép dấu Telex ("d" → "đồ" → "đồ án"): chỉ MỘT lượt gọi với chuỗi cuối', async () => {
    await renderWithProviders(<ScopeSearchScreen scope={CHANNEL} />);

    for (const partial of ['d', 'dô', 'đồ', 'đồ ', 'đồ a', 'đồ án']) {
      await typeQuery(partial);
      await sleep(60);
    }
    await waitFor(() => expect(mockedSearch).toHaveBeenCalledTimes(1), { timeout: 2000 });

    expect(mockedSearch).toHaveBeenCalledWith(
      expect.objectContaining({ scopeId: 'ch-1', scopeType: 'CHANNEL' }),
      expect.objectContaining({ q: 'đồ án' }),
    );
  });

  it('quá 8 từ bị chặn ở client (SRCH_002) — không gọi API', async () => {
    await renderWithProviders(<ScopeSearchScreen scope={CHANNEL} />);

    await typeQuery('a1 b2 c3 d4 e5 f6 g7 h8 i9');
    await sleep(550);

    expect(mockedSearch).not.toHaveBeenCalled();
    expect(screen.getByText('Từ khoá có quá nhiều từ, hãy rút gọn.')).toBeOnTheScreen();
  });
});

describe('ScopeSearchScreen — kết quả', () => {
  it('highlight theo UTF-16: đoạn khớp là <Text> lồng riêng, snippet giữ nguyên dấu gốc', async () => {
    mockedSearch.mockResolvedValue(
      searchPage([
        makeHit({ messageId: 'm-1', snippet: 'Họp đồ án nhóm', highlights: [{ start: 4, end: 9 }] }),
        // "🙂" chiếm 2 code unit: đoạn khớp "vui" (0–3) và "lắm" (7–10) không bị lệch vì emoji ở giữa.
        makeHit({
          messageId: 'm-2',
          snippet: 'vui 🙂 lắm',
          highlights: [
            { start: 0, end: 3 },
            { start: 7, end: 10 },
          ],
        }),
      ]),
    );
    await renderWithProviders(<ScopeSearchScreen scope={CHANNEL} />);

    await typeQuery('đồ án');

    expect(await screen.findByText('đồ án', {}, { timeout: 2000 })).toBeOnTheScreen();
    expect(screen.getByText('vui')).toBeOnTheScreen();
    expect(screen.getByText('lắm')).toBeOnTheScreen();
    // Snippet dựng lại đủ chữ, không lộ chuỗi chuẩn hoá ("hop do an nhom").
    expect(screen.getByLabelText(/Họp đồ án nhóm/)).toBeOnTheScreen();
    expect(screen.queryByText(/hop do an/i)).toBeNull();
  });

  it('reply trong luồng có nhãn "Trong luồng"; hit thường thì không', async () => {
    mockedSearch.mockResolvedValue(
      searchPage([
        makeHit({ messageId: 'msg-root' }),
        makeHit({ messageId: 'msg-reply', inThread: true, threadId: 'root-1', parentMessageId: 'root-1' }),
      ]),
    );
    await renderWithProviders(<ScopeSearchScreen scope={CHANNEL} />);

    await typeQuery('đồ án');

    await screen.findAllByText('Nguyễn Văn An', {}, { timeout: 2000 });
    expect(screen.getAllByText('Trong luồng')).toHaveLength(1);
  });

  it('partial:true hiện "Kết quả có thể chưa đầy đủ"', async () => {
    mockedSearch.mockResolvedValue(searchPage([makeHit()], { partial: true }));
    await renderWithProviders(<ScopeSearchScreen scope={CHANNEL} />);

    await typeQuery('đồ án');

    expect(await screen.findByText(/Kết quả có thể chưa đầy đủ/, {}, { timeout: 2000 })).toBeOnTheScreen();
  });

  it('không kết quả: "Không tìm thấy tin phù hợp"', async () => {
    await renderWithProviders(<ScopeSearchScreen scope={CHANNEL} />);

    await typeQuery('xyz123');

    expect(await screen.findByText('Không tìm thấy tin phù hợp', {}, { timeout: 2000 })).toBeOnTheScreen();
  });
});

describe('ScopeSearchScreen — phân trang cursor', () => {
  it('cuối danh sách → trang kế với cursor opaque của meta.nextCursor; hai trang nối liền', async () => {
    mockedSearch
      .mockResolvedValueOnce(
        searchPage([makeHit({ messageId: 'm-1', snippet: 'trang một', highlights: [] })], {
          hasMore: true,
          nextCursor: 'cursor-2',
        }),
      )
      .mockResolvedValueOnce(
        searchPage([makeHit({ messageId: 'm-2', snippet: 'trang hai', highlights: [] })]),
      );
    await renderWithProviders(<ScopeSearchScreen scope={CHANNEL} />);

    await typeQuery('trang');
    await screen.findByText('trang một', {}, { timeout: 2000 });
    await fireEvent(screen.getByTestId('scope-search-results'), 'endReached');

    expect(await screen.findByText('trang hai')).toBeOnTheScreen();
    expect(screen.getByText('trang một')).toBeOnTheScreen();
    expect(mockedSearch).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ q: 'trang', cursor: 'cursor-2' }),
    );
  });

  it('một trang RỖNG dù hasMore:true (BE lọc tin ẩn/thu hồi) → tự đi tiếp, không báo "không có kết quả"', async () => {
    mockedSearch
      .mockResolvedValueOnce(searchPage([], { hasMore: true, nextCursor: 'cursor-2' }))
      .mockResolvedValueOnce(
        searchPage([makeHit({ messageId: 'm-9', snippet: 'tìm thấy ở trang sau', highlights: [] })]),
      );
    await renderWithProviders(<ScopeSearchScreen scope={CHANNEL} />);

    await typeQuery('trang');

    expect(await screen.findByText('tìm thấy ở trang sau', {}, { timeout: 3000 })).toBeOnTheScreen();
    expect(screen.queryByText('Không tìm thấy tin phù hợp')).toBeNull();
    expect(mockedSearch).toHaveBeenCalledTimes(2);
  });
});
