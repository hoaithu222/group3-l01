import { useMemo } from 'react';

import { useCapabilities } from '@/shell/capabilities';

import type { ResourceLimits } from '../constants/resource-limits.constants';
import { resolveResourceLimits } from '../utils/resource-limits';

/** `capabilities.limits.resource` + mặc định — không throw khi BE chưa trả nhóm này. */
export function useResourceLimits(): ResourceLimits {
  const { data } = useCapabilities();
  return useMemo(() => resolveResourceLimits(data?.limits), [data?.limits]);
}
