import { useMemo } from 'react';

import { useCapabilities } from '@/shell/capabilities';

import { DEFAULT_SEARCH_LIMITS, type SearchLimits } from '../utils/search-query';

const positiveInt = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;

/**
 * Giới hạn tìm kiếm từ `GET /capabilities` → `limits.search` (`queryMin`/`queryMax`/`maxTerms`). `limits` cố ý là
 * `Record<string, unknown>` (`capabilities.types.ts`) nên ép kiểu TẠI CHỖ dùng; thiếu/sai kiểu thì rơi về hằng số khớp BE.
 */
export function useSearchLimits(): SearchLimits {
  const { data } = useCapabilities();
  const raw = data?.limits.search as Partial<Record<keyof SearchLimits, unknown>> | undefined;

  const queryMin = positiveInt(raw?.queryMin, DEFAULT_SEARCH_LIMITS.queryMin);
  const queryMax = positiveInt(raw?.queryMax, DEFAULT_SEARCH_LIMITS.queryMax);
  const maxTerms = positiveInt(raw?.maxTerms, DEFAULT_SEARCH_LIMITS.maxTerms);

  return useMemo(() => ({ queryMin, queryMax, maxTerms }), [queryMin, queryMax, maxTerms]);
}
