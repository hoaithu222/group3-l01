import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { portfolioProjectService } from '../api/portfolio-project.service';
import { portfolioService } from '../api/portfolio.service';
import { isFeatureOff, isGone } from '../utils/portfolio-errors';
import { portfolioKeys } from './portfolio.keys';

const THIRTY_SECONDS = 30_000;
const ONE_HOUR = 3_600_000;

/**
 * Hồ sơ + dự án + lần dựng gần nhất (app.md p6-07 §4) — MỘT lượt tải cho cả màn Tổng quan và mọi màn con (cache chung, mutation vá thẳng vào đây).
 * `retry` tắt cho 404: cờ `career`/`portfolio.enabled` tắt (`CFG_005`) hay hồ sơ không còn là câu trả lời dứt khoát, thử lại chỉ làm màn "Tính năng chưa bật" hiện chậm.
 */
export function usePortfolio() {
  return useQuery({
    queryFn: portfolioService.overview,
    queryKey: portfolioKeys.overview(),
    retry: (failureCount, error) => failureCount < 2 && !isFeatureOff(error) && !isGone(error),
    staleTime: THIRTY_SECONDS,
  });
}

/** Kiểm slug có dùng được không. `enabled` = slug ĐÃ hợp lệ cục bộ và đã qua debounce (BE giới hạn 60 lượt/phút); `staleTime` 30 giây. */
export function useSlugAvailability(slug: string, enabled: boolean) {
  return useQuery({
    enabled,
    queryFn: () => portfolioService.slugAvailable(slug),
    queryKey: portfolioKeys.slug(slug),
    retry: false,
    staleTime: THIRTY_SECONDS,
  });
}

/** Danh mục 4 mẫu × 6 màu nhấn — gần như tĩnh nên `staleTime` 1 giờ. */
export function usePortfolioTemplates() {
  return useQuery({
    queryFn: portfolioService.templates,
    queryKey: portfolioKeys.templates(),
    staleTime: ONE_HOUR,
  });
}

/**
 * Nhóm đủ điều kiện thêm vào hồ sơ — cursor. ⚠️ THỨ TỰ khoá quan trọng: `queryFn` phải đứng TRƯỚC `getNextPageParam` thì TypeScript mới suy ra kiểu trang.
 * `staleTime` 0: người dùng vừa thêm/xoá dự án thì `alreadyAdded` phải đúng ngay lần mở kế tiếp.
 */
export function useEligibleWorkspaces() {
  return useInfiniteQuery({
    queryFn: ({ pageParam }) => portfolioProjectService.eligible(pageParam),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryKey: portfolioKeys.eligible(),
    retry: false,
  });
}
