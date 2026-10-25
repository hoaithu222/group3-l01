import { useMemo } from 'react';

import { DEFAULT_SEARCH_LIMITS, type SearchLimits } from '@/shared/search';
import { useCapabilities } from '@/shell/capabilities';

const positiveInt = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;

/**
 * Giới hạn từ khoá từ `GET /capabilities` → `limits.search` (`queryMin`/`queryMax`/`maxTerms`). `limits` cố ý là
 * `Record<string, unknown>` (`capabilities.types.ts`) nên ép kiểu TẠI CHỖ dùng; thiếu/sai kiểu thì rơi về hằng số khớp BE.
 * (Cùng logic `discovery/hooks/useSearchLimits` — `shared/` không được import `@/shell`, nên mỗi feature giữ một bản.)
 */
export function useSearchLimits(): SearchLimits {
  const { data } = useCapabilities();
  const raw = data?.limits.search as Partial<Record<keyof SearchLimits, unknown>> | undefined;

  const queryMin = positiveInt(raw?.queryMin, DEFAULT_SEARCH_LIMITS.queryMin);
  const queryMax = positiveInt(raw?.queryMax, DEFAULT_SEARCH_LIMITS.queryMax);
  const maxTerms = positiveInt(raw?.maxTerms, DEFAULT_SEARCH_LIMITS.maxTerms);

  return useMemo(() => ({ queryMin, queryMax, maxTerms }), [queryMin, queryMax, maxTerms]);
}

/** Khoảng lùi mặc định của BE khi tìm tin/tệp mà CHƯA chọn khoảng ngày (`LIMITS.search.defaultLookbackMonths`). */
const DEFAULT_LOOKBACK_MONTHS = 12;

/**
 * Số tháng BE chỉ tìm ngược khi người dùng chưa chọn khoảng ngày (be.md p5-04 §5) — từ `limits.search.defaultLookbackMonths` của
 * `GET /capabilities`, thiếu/sai kiểu thì rơi về 12. Để màn nói THẬT với người dùng khi "không tìm thấy" có thể chỉ vì tin cũ hơn.
 */
export function useSearchLookbackMonths(): number {
  const { data } = useCapabilities();
  const raw = data?.limits.search as { defaultLookbackMonths?: unknown } | undefined;
  return positiveInt(raw?.defaultLookbackMonths, DEFAULT_LOOKBACK_MONTHS);
}
