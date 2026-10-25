/**
 * DisplayUrlSync — đồng bộ 2 chiều URL query string ↔ display store.
 *
 * URL contract: `?display=tv&scale=1.2` trên mọi route.
 * `scale` chỉ xuất hiện khi TV bật và khác mức mặc định.
 *
 * Vì sao cần URL param thay vì chỉ localStorage:
 *  - Máy cắm vào TV chỉ cần một URL duy nhất, không phải vào cài đặt.
 *  - Share link cho người khác xem đúng chế độ.
 *  - F5 / mở tab mới giữ nguyên trạng thái.
 * Xem `api-patterns.md §URL-synced Filters`.
 *
 * Chế độ standard là mặc định nên KHÔNG ghi `?display=standard` lên URL.
 * Param rác (`?display=abc`) bị BỎ QUA, không ghi đè giá trị đã lưu.
 */
import { memo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

import {
  DISPLAY_PARAM,
  SCALE_PARAM,
  parseDisplayMode,
  parseUiScale,
  useDisplayStore,
} from '@/app/store';

export const DisplayUrlSync = memo(function DisplayUrlSync() {
  const [searchParams, setSearchParams] = useSearchParams();

  const mode = useDisplayStore((s) => s.mode);
  const uiScale = useDisplayStore((s) => s.uiScale);
  const setMode = useDisplayStore((s) => s.setMode);
  const setUiScale = useDisplayStore((s) => s.setUiScale);

  /** Bước URL → store chỉ chạy 1 lần khi mount. */
  const hydratedRef = useRef(false);

  // ── 1) URL → store (1 lần khi mount) ────────────────────────
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    // Đặt `scale` TRƯỚC `mode`: ngược lại sẽ có một khung hình vẽ ở mức cũ rồi
    // mới nhảy sang mức mới → giật.
    const urlScale = parseUiScale(searchParams.get(SCALE_PARAM));
    if (urlScale !== null) setUiScale(urlScale);

    const urlMode = parseDisplayMode(searchParams.get(DISPLAY_PARAM));
    if (urlMode !== null) setMode(urlMode);
    // Chỉ chạy mount once — không depend vào state thay đổi runtime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 2) Store → URL (mỗi lần store đổi sau hydrate) ──────────
  useEffect(() => {
    if (!hydratedRef.current) return;

    const isTv = mode === 'tv';
    const params = new URLSearchParams(searchParams);
    let changed = false;

    /** Giá trị rỗng → xoá key, giữ URL sạch (đúng quy ước `useQueryParams`). */
    const sync = (key: string, value: string | null) => {
      if (value === null) {
        if (params.has(key)) {
          params.delete(key);
          changed = true;
        }
        return;
      }
      if (params.get(key) !== value) {
        params.set(key, value);
        changed = true;
      }
    };

    // Chế độ standard là mặc định → KHÔNG ghi `?display=standard`.
    sync(DISPLAY_PARAM, isTv ? 'tv' : null);
    // `scale` chỉ có nghĩa khi TV bật; tắt thì gỡ khỏi URL cho gọn (giá trị vẫn
    // còn trong localStorage nên bật lại không mất lựa chọn).
    sync(SCALE_PARAM, isTv ? String(uiScale) : null);

    // `replace: true` → không tạo entry history mới mỗi lần sync.
    if (changed) setSearchParams(params, { replace: true });
  }, [mode, uiScale, searchParams, setSearchParams]);

  return null;
});
