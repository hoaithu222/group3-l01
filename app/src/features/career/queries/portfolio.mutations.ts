import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { errorCodeOf } from '@/shared/utils/errors';

import { portfolioService } from '../api/portfolio.service';
import type { Portfolio, PortfolioOverview, SavePortfolioInput } from '../api/portfolio.types';
import { patchBuild, patchPortfolio } from '../utils/portfolio-cache';
import { isVersionConflict } from '../utils/portfolio-errors';
import { portfolioKeys } from './portfolio.keys';

/** Làm mới hồ sơ từ server. ⚠️ `exact`: khoá hồ sơ là TIỀN TỐ của khoá mẫu/slug/nhóm đủ điều kiện — xem `portfolio.keys.ts`. */
export const refreshOverview = (queryClient: QueryClient): Promise<void> =>
  queryClient.invalidateQueries({ exact: true, queryKey: portfolioKeys.overview() });

/**
 * Lưu hồ sơ (`PUT` ghi ĐỦ, `expectedVersion: 0` khi tạo lần đầu). Thành công ⇒ vá `portfolio` (có `version` MỚI) vào cache; hồ sơ vừa được tạo lười
 * (cache đang `portfolio: null`) thì làm mới thêm để kéo theo `latestBuild`/`publicUrl`. Lỗi ⇒ nơi gọi tự hiện TRONG form (`skipErrorToast` ở service).
 */
export function useSavePortfolio() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SavePortfolioInput) => portfolioService.save(input),
    onSuccess: (portfolio) => {
      const before = queryClient.getQueryData<PortfolioOverview>(portfolioKeys.overview());
      queryClient.setQueryData<PortfolioOverview | undefined>(portfolioKeys.overview(), (old) =>
        patchPortfolio(old, portfolio),
      );
      if (before && before.portfolio === null) void refreshOverview(queryClient);
    },
  });
}

/**
 * Đổi slug. Đang công khai thì BE tự xếp dựng lại trang (slug nằm trong canonical + đường dẫn ảnh) ⇒ làm mới để thấy "Đang tạo trang…".
 * Slug cũ được giữ 30 ngày để chuyển hướng 301 — không ai khác lấy được.
 */
export function useChangeSlug() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ expectedVersion, slug }: { slug: string; expectedVersion: number }) =>
      portfolioService.changeSlug(slug, expectedVersion),
    onSuccess: (portfolio: Portfolio) => {
      queryClient.setQueryData<PortfolioOverview | undefined>(portfolioKeys.overview(), (old) =>
        patchPortfolio(old, portfolio),
      );
      if (portfolio.status === 'PUBLISHED') void refreshOverview(queryClient);
    },
  });
}

/**
 * Công khai / "Cập nhật trang": 202 + `buildId` ⇒ dựng bản `QUEUED` tạm vào `latestBuild` để màn hiện "Đang tạo trang…" TỨC THÌ; socket/poll thay bằng kết quả
 * thật. `PORT_009` (đang dựng) và `RES_003` (lệch phiên bản) ⇒ làm mới để màn thấy trạng thái/`version` đúng, rồi lỗi vẫn ném cho tấm hiện.
 */
export function usePublishPortfolio() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (expectedVersion: number) => portfolioService.publish(expectedVersion),
    onError: (error) => {
      if (errorCodeOf(error) === 'PORT_009' || isVersionConflict(error))
        void refreshOverview(queryClient);
    },
    onSuccess: (result, expectedVersion) => {
      queryClient.setQueryData<PortfolioOverview | undefined>(portfolioKeys.overview(), (old) =>
        patchBuild(old, {
          buildVersion: result.buildVersion,
          createdAt: new Date().toISOString(),
          error: null,
          finishedAt: null,
          id: result.buildId,
          portfolioVersion: expectedVersion,
          sizeBytes: null,
          status: 'QUEUED',
          trigger: 'PUBLISH',
        }),
      );
    },
  });
}

/** Ngừng công khai: vá TỨC THÌ `status`/`publicUrl` rồi làm mới lấy sự thật (BE 404 ngay; nginx có thể còn cache tối đa 5 phút — câu đó nằm ở hộp thoại). */
export function useUnpublishPortfolio() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => portfolioService.unpublish(),
    onSuccess: () => {
      queryClient.setQueryData<PortfolioOverview | undefined>(portfolioKeys.overview(), (old) => {
        if (!old?.portfolio) return old;
        return {
          ...old,
          portfolio: { ...old.portfolio, hasUnpublishedChanges: false, status: 'UNPUBLISHED' },
          publicUrl: null,
        };
      });
      void refreshOverview(queryClient);
    },
  });
}
