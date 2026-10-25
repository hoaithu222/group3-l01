import { act, renderHook, waitFor } from '@testing-library/react-native';

import { usePullRefresh } from '../hooks/usePullRefresh';

/**
 * Vòng quay kéo-để-làm-mới của danh sách nhóm CHỈ theo lượt NGƯỜI DÙNG kéo — trước đây `refreshing={isRefetching}` làm
 * vòng quay tự hiện mỗi lần tải ngầm (quay lại tab, socket `workspace:*`), đè lên thẻ đầu dù không ai kéo.
 */
describe('usePullRefresh', () => {
  it('bật khi kéo, tắt khi CHÍNH lần tải đó xong', async () => {
    // ⚠️ `refetch()` của React Query KHÔNG ném khi tải hỏng (trả kết quả có `isError`) — giả lập đúng hợp đồng đó.
    let finish: (() => void) | undefined;
    const refetch = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = await renderHook(() => usePullRefresh(refetch));
    expect(result.current.refreshing).toBe(false);

    await act(async () => result.current.onRefresh());
    expect(result.current.refreshing).toBe(true);
    expect(refetch).toHaveBeenCalledTimes(1);

    await act(async () => finish?.());
    await waitFor(() => expect(result.current.refreshing).toBe(false));
  });
});
