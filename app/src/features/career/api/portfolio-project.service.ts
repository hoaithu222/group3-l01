import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  PORTFOLIO_ELIGIBLE_PATH,
  PORTFOLIO_PROJECTS_ORDER_PATH,
  PORTFOLIO_PROJECTS_PATH,
  portfolioProjectPath,
  portfolioProjectRefreshPath,
} from './portfolio.api';
import type {
  EligiblePage,
  EligibleWorkspace,
  PortfolioProject,
  UpdateProjectInput,
} from './portfolio.types';

/** Dự án trong portfolio (p6-07). Cùng luật `skipErrorToast` với `portfolioService`: lỗi hiện ở nơi gọi. */
export const portfolioProjectService = {
  /**
   * Nhóm đủ điều kiện — cursor. ⚠️ BE trả `{ data: [...], meta: { nextCursor } }` với `data` là MẢNG nên đọc `response.data` trực tiếp
   * (`unwrapData` bóc mất `meta`).
   */
  async eligible(cursor?: string): Promise<EligiblePage> {
    const response = await apiClient.get<{
      data: EligibleWorkspace[];
      meta?: { nextCursor?: string | null };
    }>(PORTFOLIO_ELIGIBLE_PATH, { params: cursor ? { cursor } : undefined, skipErrorToast: true });
    return { items: response.data.data, nextCursor: response.data.meta?.nextCursor ?? null };
  },

  /** `Idempotency-Key` bắt buộc: bấm hai lần/mạng chậm vẫn MỘT dự án. `PORT_004` · `PORT_005` · `PORT_006`. */
  async add(workspaceId: string, idempotencyKey: string): Promise<PortfolioProject> {
    return unwrapData<PortfolioProject>(
      await apiClient.post(
        PORTFOLIO_PROJECTS_PATH,
        { workspaceId },
        { headers: { 'Idempotency-Key': idempotencyKey }, skipErrorToast: true },
      ),
    );
  },

  async update(projectId: string, input: UpdateProjectInput): Promise<PortfolioProject> {
    return unwrapData<PortfolioProject>(
      await apiClient.patch(portfolioProjectPath(projectId), input, { skipErrorToast: true }),
    );
  },

  async remove(projectId: string): Promise<void> {
    await apiClient.delete(portfolioProjectPath(projectId), { skipErrorToast: true });
  },

  /** 10 lượt/giờ — quá hạn mức trả 429 `PORT_007` kèm `retryAfterSeconds`. */
  async refresh(projectId: string): Promise<PortfolioProject> {
    return unwrapData<PortfolioProject>(
      await apiClient.post(portfolioProjectRefreshPath(projectId), undefined, {
        skipErrorToast: true,
      }),
    );
  },

  /** `projectIds` PHẢI đúng bằng tập dự án hiện có (thiếu/thừa/trùng → 400). Trả danh sách MỚI theo thứ tự. */
  async reorder(projectIds: string[]): Promise<PortfolioProject[]> {
    return unwrapData<PortfolioProject[]>(
      await apiClient.put(PORTFOLIO_PROJECTS_ORDER_PATH, { projectIds }, { skipErrorToast: true }),
    );
  },
};
