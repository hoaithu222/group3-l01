import { useMemo } from 'react';

import type { CapabilityLimits } from '@/core/capabilities';
import { useCapabilities } from '@/shell/capabilities';

import { FALLBACK_PORTFOLIO_LIMITS, type PortfolioLimits } from '../constants/portfolio.constants';

/**
 * `capabilities.limits.portfolio` khai `unknown` cố ý (`capabilities.types.ts`) — ép kiểu TẠI ĐÂY, từng khoá thiếu/không phải số thì dùng trần cứng của BE
 * (`FALLBACK_PORTFOLIO_LIMITS`). Không tin cả khối: admin sửa `SystemConfig` có thể làm một khoá vắng mặt.
 */
export function readPortfolioLimits(limits: CapabilityLimits | undefined): PortfolioLimits {
  const raw = limits?.portfolio;
  const result: PortfolioLimits = { ...FALLBACK_PORTFOLIO_LIMITS };
  if (!raw || typeof raw !== 'object') return result;
  for (const key of Object.keys(result) as (keyof PortfolioLimits)[]) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) result[key] = value;
  }
  return result;
}

/** Giới hạn hiện hành của portfolio (độ dài giới thiệu, số dự án, số liên kết…). Tham chiếu ỔN ĐỊNH giữa các lần vẽ (dùng được làm phụ thuộc `useMemo`/schema). */
export function usePortfolioLimits(): PortfolioLimits {
  const { data } = useCapabilities();
  const limits = data?.limits;
  return useMemo(() => readPortfolioLimits(limits), [limits]);
}
