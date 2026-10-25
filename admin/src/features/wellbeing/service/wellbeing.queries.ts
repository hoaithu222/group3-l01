import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { wellbeingService } from './wellbeing.service';

/** Query key theo admin.md p7-03 §3: `['wellbeing','overview',range]`, `['wellbeing','rules']` (`range` ở đây là số tuần). */
export const wellbeingKeys = {
  all: ['wellbeing'] as const,
  overview: (weeks: number) => ['wellbeing', 'overview', weeks] as const,
  rules: () => ['wellbeing', 'rules'] as const,
};

/** `GET /admin/wellbeing/overview?weeks` — đổi khoảng thì giữ số cũ mờ đi tới khi số mới về (`isPlaceholderData`). */
export const useWellbeingOverview = (weeks: number) =>
  useQuery({
    queryKey: wellbeingKeys.overview(weeks),
    queryFn: () => wellbeingService.overview(weeks),
    select: (res) => res.data,
    placeholderData: keepPreviousData,
  });

/** `GET /admin/wellbeing/rules` — `version` của kết quả này là `expectedVersion` khi lưu. */
export const useBurnoutRules = () =>
  useQuery({
    queryKey: wellbeingKeys.rules(),
    queryFn: wellbeingService.rules,
    select: (res) => res.data,
  });
