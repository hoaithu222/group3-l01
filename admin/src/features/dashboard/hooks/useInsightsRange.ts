import { useCallback } from 'react';

import type { InsightsRange } from '@/core/api/admin';
import { useQueryParams } from '@/shared/hooks';

import {
  INSIGHTS_DEFAULT_RANGE,
  INSIGHTS_RANGE_PARAM,
} from '../constants/insights.constants';
import { parseInsightsRange } from '../utils/insight-series.utils';

/**
 * Khoảng thời gian của trang Tổng quan, sống trên URL (`?range=7d|90d`) — F5 / gửi link cho người khác vẫn đúng khoảng đang xem
 * (`api-patterns.md §URL-synced filters`). Mặc định (`30d`) thì BỎ khỏi URL; giá trị lạ trên URL rơi về mặc định.
 *
 * `setRange` nhận `string` (không phải `InsightsRange`) để nối thẳng vào `SegmentToggle.onValueChange`; giá trị lạ cũng rơi về mặc định.
 */
export function useInsightsRange() {
  const { getParam, updateParams } = useQueryParams();
  const range = parseInsightsRange(getParam(INSIGHTS_RANGE_PARAM));

  const setRange = useCallback(
    (next: string) => {
      const parsed: InsightsRange = parseInsightsRange(next);
      updateParams({ [INSIGHTS_RANGE_PARAM]: parsed === INSIGHTS_DEFAULT_RANGE ? null : parsed });
    },
    [updateParams],
  );

  return { range, setRange } as const;
}
