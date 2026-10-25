import { useCallback, useEffect, useState } from 'react';

import { readJson, writeJson } from '@/core/storage/app-storage';

import {
  DEFAULT_PREFS,
  parsePrefs,
  prefsStorageKey,
  type ExplorerPrefs,
} from '../utils/explorer-prefs';

/**
 * Chế độ lưới/danh sách + sắp xếp, lưu `AsyncStorage` theo người dùng (app.md §5,
 * không nhạy cảm). Khung hình đầu dùng mặc định rồi nạp lại — `AsyncStorage`
 * bất đồng bộ; sai lệch một nhịp chấp nhận được vì đây chỉ là tuỳ chọn hiển thị.
 */
export function useExplorerPrefs(userId: string | undefined) {
  const [prefs, setPrefs] = useState<ExplorerPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void readJson<unknown>(prefsStorageKey(userId)).then((raw) => {
      if (!cancelled && raw !== null) setPrefs(parsePrefs(raw));
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const update = useCallback(
    (patch: Partial<ExplorerPrefs>) => {
      setPrefs((current) => {
        const next = { ...current, ...patch };
        if (userId) void writeJson(prefsStorageKey(userId), next);
        return next;
      });
    },
    [userId],
  );

  return { prefs, update };
}
