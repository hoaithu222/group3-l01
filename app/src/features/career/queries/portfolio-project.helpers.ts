import type { QueryClient } from '@tanstack/react-query';

import { showToast } from '@/shared/utils/toast.utils';

import type { PortfolioOverview, PortfolioProject } from '../api/portfolio.types';
import { markDirty, upsertProject } from '../utils/portfolio-cache';
import { isGone, isVersionConflict, portfolioErrorMessage } from '../utils/portfolio-errors';
import { portfolioKeys } from './portfolio.keys';
import { refreshOverview } from './portfolio.mutations';

/** Tách khỏi `portfolio-project.mutations.ts` cho vừa trần độ dài: phần cache/báo lỗi mà các mutation dự án dùng chung. */
export type Cache = PortfolioOverview | undefined;

export const overviewOf = (queryClient: QueryClient): Cache =>
  queryClient.getQueryData<PortfolioOverview>(portfolioKeys.overview());

/** Ghi một dự án đã lưu vào cache (+ báo "có thay đổi chưa cập nhật lên trang"). */
export function applySaved(queryClient: QueryClient, project: PortfolioProject): void {
  queryClient.setQueryData<Cache>(portfolioKeys.overview(), (old) =>
    markDirty(upsertProject(old, project)),
  );
}

/** 404: dự án đã bị xoá ở nơi khác ⇒ kéo hồ sơ mới về để danh sách bỏ dòng đó (nơi gọi lo báo + rời màn). */
export const resyncIfGone = (queryClient: QueryClient, error: unknown): void => {
  if (isGone(error)) void refreshOverview(queryClient);
};

/** Lỗi của thao tác LẠC QUAN: đã trả cache về cũ ⇒ toast đúng một lần; lệch phiên bản thì kéo bản mới về. */
export function reportOptimisticError(queryClient: QueryClient, error: unknown): void {
  showToast('error', portfolioErrorMessage(error));
  if (isVersionConflict(error)) void refreshOverview(queryClient);
  resyncIfGone(queryClient, error);
}
