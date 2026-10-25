import { act } from '@testing-library/react-native';

import type { PickedFile } from '@/core/uploads/upload.types';

/** Tiện ích chung cho test luồng tải lên (`upload-*.test.tsx`). */
export function file(overrides: Partial<PickedFile> = {}): PickedFile {
  return {
    kind: 'FILE',
    mime: 'application/pdf',
    name: 'a.pdf',
    size: 1000,
    uri: 'file:///a.pdf',
    ...overrides,
  };
}

/** RNTL 14: `act` là BẤT ĐỒNG BỘ — gọi không `await` là các lượt act chồng lên nhau và test sau hỏng. */
export async function run(fn: () => void): Promise<void> {
  await act(async () => {
    fn();
  });
}

/** Chờ microtask của `finalize()` (`await create`) chạy xong. */
export async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

export function only<T>(list: T[]): T {
  const [first] = list;
  if (first === undefined) throw new Error('Test cần đúng một phần tử');
  return first;
}
