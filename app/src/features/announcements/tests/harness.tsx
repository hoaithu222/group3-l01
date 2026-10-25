import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { announcementKeys } from '../api/announcements.keys';
import type { AnnouncementView } from '../api/announcements.types';
import { makeQueryClient } from './fixtures';

/**
 * Đồ dùng chung của các test HOOK (`*.queries.test.tsx`): cache danh sách yêu cầu của kênh `ch-1`, wrapper `QueryClientProvider`,
 * lời gọi HTTP treo lơ lửng, và `flush`. Ca giao diện dùng `renderWithProviders` của `fixtures.tsx`.
 */
export const LIST_KEY = announcementKeys.channel('ch-1');

export const readList = (client: QueryClient) => client.getQueryData<AnnouncementView[]>(LIST_KEY);

/** `[messageId, confirmedByMe]` của từng dòng — đủ để so trạng thái huy hiệu. */
export const rowsOf = (client: QueryClient) =>
  readList(client)?.map((view) => [view.messageId, view.confirmedByMe]);

export function setupHookClient(list?: AnnouncementView[]) {
  const queryClient = makeQueryClient();
  if (list) queryClient.setQueryData(LIST_KEY, list);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

/** Lời gọi HTTP treo lơ lửng — kiểm trạng thái TRƯỚC khi server trả lời. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

/**
 * Cho React Query đẩy kết quả vào React: nó báo cho observer qua `setTimeout(0)`, và cập nhật ngoài `act` không được RNTL xả — nên
 * chờ MỘT nhịp macrotask TRONG `act` trước khi đọc `result.current`.
 */
export const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

/** Chạy một lời gọi `mutateAsync` trong `act`, chờ xong (kể cả lỗi — test đọc HIỆU ỨNG, không đọc ngoại lệ) rồi `flush`. */
export async function run(start: () => Promise<unknown>) {
  await act(async () => {
    await start().catch(() => undefined);
  });
  await flush();
}
