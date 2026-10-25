import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { workspaceSearchKeys, type WorkspaceSearchPage, type WorkspaceSearchType } from '../api';
import { useTabCounts } from '../hooks/useTabCounts';
import { buildSearchParams, EMPTY_FILTERS, type SearchFilters } from '../utils/search-params';
import { EMPTY_PAGE, makeMessageHit, messagePage } from './fixtures';

/**
 * `useTabCounts` — số đếm từng tab đọc từ CACHE nhưng PHẢN ỨNG khi cache đổi, KHÔNG cần props/state nào khác đổi. Đó là thứ
 * `readTabCounts` gọi thẳng trong lúc vẽ không làm được (và React Compiler còn nhớ kết quả theo đầu vào — xem chú thích của hook);
 * các test màn không bắt được vì Jest không chạy trình biên dịch, nên khoá riêng ở đây bằng cách chỉ ĐỔI CACHE giữa hai lần đọc.
 */

const TYPES: readonly WorkspaceSearchType[] = ['messages', 'files', 'channels'];

function setup() {
  const queryClient = new QueryClient();
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return { queryClient, wrapper };
}

function seed(
  queryClient: QueryClient,
  type: WorkspaceSearchType,
  pages: WorkspaceSearchPage[],
  {
    filters = EMPTY_FILTERS,
    workspaceId = 'ws-1',
  }: { filters?: SearchFilters; workspaceId?: string } = {},
) {
  const key = workspaceSearchKeys.search(workspaceId, buildSearchParams('đồ án', type, filters));
  queryClient.setQueryData(key, { pageParams: pages.map(() => undefined), pages });
}

const hits = (n: number) =>
  Array.from({ length: n }, (_, i) => makeMessageHit({ messageId: `m-${i}` }));

describe('useTabCounts', () => {
  it('cache đổi (KHÔNG có props/state nào đổi) ⇒ số đếm cập nhật theo: chưa có → 1 → "30+"', async () => {
    const { queryClient, wrapper } = setup();
    const { result } = await renderHook(() => useTabCounts('ws-1', 'đồ án', EMPTY_FILTERS, TYPES), {
      wrapper,
    });
    expect(result.current).toEqual({});

    await act(async () => seed(queryClient, 'messages', [messagePage(hits(1))]));
    expect(result.current).toEqual({ messages: { count: 1, hasMore: false } });

    await act(async () =>
      seed(queryClient, 'messages', [messagePage(hits(30), { hasMore: true, nextCursor: 'c2' })]),
    );
    expect(result.current.messages).toEqual({ count: 30, hasMore: true });

    await act(async () => seed(queryClient, 'files', [EMPTY_PAGE]));
    expect(result.current.files).toEqual({ count: 0, hasMore: false });
    expect(result.current.channels).toBeUndefined();
  });

  it('cộng dồn nhiều trang; hasMore lấy của trang CUỐI', async () => {
    const { queryClient, wrapper } = setup();
    const { result } = await renderHook(() => useTabCounts('ws-1', 'đồ án', EMPTY_FILTERS, TYPES), {
      wrapper,
    });

    await act(async () =>
      seed(queryClient, 'messages', [
        messagePage(hits(30), { hasMore: true, nextCursor: 'c2' }),
        messagePage(hits(12)),
      ]),
    );

    expect(result.current.messages).toEqual({ count: 42, hasMore: false });
  });

  it('từ khoá chưa hợp lệ (text = null): không có số nào dù cache đang có dữ liệu của từ khoá trước', async () => {
    const { queryClient, wrapper } = setup();
    seed(queryClient, 'messages', [messagePage(hits(3))]);

    const { result } = await renderHook(() => useTabCounts('ws-1', null, EMPTY_FILTERS, TYPES), {
      wrapper,
    });

    expect(result.current).toEqual({});
  });

  it('bộ lọc là một phần của khoá: số của lượt CHƯA lọc không hiện khi đang lọc, và ngược lại', async () => {
    const { queryClient, wrapper } = setup();
    const filtered: SearchFilters = { ...EMPTY_FILTERS, hasFile: true };
    seed(queryClient, 'messages', [messagePage(hits(5))]);
    seed(queryClient, 'messages', [messagePage(hits(2))], { filters: filtered });

    const plain = await renderHook(() => useTabCounts('ws-1', 'đồ án', EMPTY_FILTERS, TYPES), {
      wrapper,
    });
    const withFilter = await renderHook(() => useTabCounts('ws-1', 'đồ án', filtered, TYPES), {
      wrapper,
    });

    expect(plain.result.current.messages?.count).toBe(5);
    expect(withFilter.result.current.messages?.count).toBe(2);
  });

  it('chỉ đếm ĐÚNG nhóm đang mở; đổi nhóm/từ khoá thì đọc lại', async () => {
    const { queryClient, wrapper } = setup();
    seed(queryClient, 'messages', [messagePage(hits(4))], { workspaceId: 'ws-2' });
    const { rerender, result } = await renderHook(
      ({ workspaceId }: { workspaceId: string }) =>
        useTabCounts(workspaceId, 'đồ án', EMPTY_FILTERS, TYPES),
      { initialProps: { workspaceId: 'ws-1' }, wrapper },
    );
    expect(result.current).toEqual({});

    await rerender({ workspaceId: 'ws-2' });

    expect(result.current.messages?.count).toBe(4);
  });

  it('gỡ màn xong thì ngừng lắng nghe: đổi cache sau đó không ném lỗi', async () => {
    const { queryClient, wrapper } = setup();
    const view = await renderHook(() => useTabCounts('ws-1', 'đồ án', EMPTY_FILTERS, TYPES), {
      wrapper,
    });

    await view.unmount();

    expect(() => seed(queryClient, 'messages', [messagePage(hits(1))])).not.toThrow();
  });
});
