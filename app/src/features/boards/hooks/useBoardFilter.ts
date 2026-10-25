import { useEffect, useState } from 'react';

import { readJson, writeJson } from '@/core/storage/app-storage';
import { useAuthStore } from '@/shell/store/slices/auth';

import type { BoardFilter } from '../api/boards.types';
import { normalizeFilter } from '../utils/board-filter';
import { useDebouncedValue } from './useDebouncedValue';

/** Phần bộ lọc được NHỚ giữa các lần mở bảng — ⛔ không gồm `q` (chữ đang gõ là tạm thời). */
type StoredFilter = Pick<BoardFilter, 'assigneeId' | 'labelId' | 'overdue'>;

export function boardFilterStorageKey(userId: string, boardId: string): string {
  return `boards:filter:${userId}:${boardId}`;
}

/**
 * Bộ lọc của MỘT bảng (`app.md` §4 "Lọc", §5): chip lưu vào `AsyncStorage`
 * `boards:filter:<userId>:<boardId>`, ô tìm debounce 300 ms.
 *
 * `ready` = đã đọc xong bộ lọc đã lưu. Màn phải ĐỢI nó trước khi gọi
 * `GET /boards/:id/tasks`, nếu không sẽ tải bảng KHÔNG lọc rồi tải lại ngay khi
 * bộ lọc đã lưu về — hai request, và bảng nháy giữa hai kết quả.
 */
export function useBoardFilter(boardId: string) {
  const userId = useAuthStore((state) => state.user?.id) ?? 'anonymous';
  const [stored, setStored] = useState<StoredFilter>({});
  const [ready, setReady] = useState(false);
  const [rawQuery, setRawQuery] = useState('');
  const query = useDebouncedValue(rawQuery.trim());

  useEffect(() => {
    let cancelled = false;
    void readJson<StoredFilter>(boardFilterStorageKey(userId, boardId)).then((saved) => {
      if (cancelled) return;
      if (saved) setStored(saved);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [boardId, userId]);

  const persist = (next: StoredFilter) => {
    setStored(next);
    void writeJson(boardFilterStorageKey(userId, boardId), next);
  };

  return {
    filter: normalizeFilter({ ...stored, q: query }),
    /** Bộ lọc dạng CHIP, không kèm chữ tìm — để hiển thị chip nào đang bật. */
    chips: stored,
    patch: (partial: StoredFilter) => persist({ ...stored, ...partial }),
    ready,
    reset: () => {
      persist({});
      setRawQuery('');
    },
    setQuery: setRawQuery,
  };
}
