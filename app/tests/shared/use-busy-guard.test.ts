import { renderHook } from '@testing-library/react-native';

import { useBusyGuard } from '@/shared/hooks/useBusyGuard';

/**
 * `useBusyGuard` — cờ `ref` đổi ĐỒNG BỘ nên chặn được lượt thứ hai trong cùng khung hình, nơi
 * `isPending` của React Query (cập nhật bất đồng bộ) vẫn còn `false`.
 */

it('lượt thứ hai khi lượt đầu chưa `release` bị bỏ qua; `release` xong thì được chạy lại', async () => {
  const { result } = await renderHook(() => useBusyGuard());
  const start = jest.fn();

  result.current(start);
  result.current(start);
  expect(start).toHaveBeenCalledTimes(1);

  const release = start.mock.calls[0][0] as () => void;
  release();
  result.current(start);
  expect(start).toHaveBeenCalledTimes(2);
});

it('`release` gọi nhiều lần vẫn an toàn (idempotent)', async () => {
  const { result } = await renderHook(() => useBusyGuard());
  const start = jest.fn();

  result.current(start);
  const release = start.mock.calls[0][0] as () => void;
  release();
  release();
  result.current(start);
  result.current(start);

  expect(start).toHaveBeenCalledTimes(2);
});
