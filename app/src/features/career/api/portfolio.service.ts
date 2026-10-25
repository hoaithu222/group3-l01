import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  MY_PORTFOLIO_PATH,
  PORTFOLIO_LATEST_BUILD_PATH,
  PORTFOLIO_PUBLISH_PATH,
  PORTFOLIO_SLUG_AVAILABLE_PATH,
  PORTFOLIO_SLUG_PATH,
  PORTFOLIO_TEMPLATES_PATH,
  PORTFOLIO_UNPUBLISH_PATH,
} from './portfolio.api';
import type {
  Portfolio,
  PortfolioBuild,
  PortfolioOverview,
  PortfolioTemplateInfo,
  PublishResult,
  SavePortfolioInput,
  SlugAvailability,
} from './portfolio.types';

/**
 * Hồ sơ portfolio của tôi (p6-07). ⚠️ TẤT CẢ lời gọi đặt `skipErrorToast`: lỗi `PORT_*` là một phần luồng (hiện TRONG form/tấm/hộp thoại, không
 * biến mất sau 4 giây như toast) hoặc do hook tự rollback + toast đúng một lần — để interceptor toast thêm thì người dùng thấy hai thông báo.
 */
export const portfolioService = {
  async overview(): Promise<PortfolioOverview> {
    return unwrapData<PortfolioOverview>(
      await apiClient.get(MY_PORTFOLIO_PATH, { skipErrorToast: true }),
    );
  },

  /** Ghi ĐỦ hồ sơ; `expectedVersion: 0` khi chưa có hồ sơ (BE tạo lười, slug tự sinh). 409 `RES_003` = lệch phiên bản. */
  async save(input: SavePortfolioInput): Promise<Portfolio> {
    return unwrapData<Portfolio>(
      await apiClient.put(MY_PORTFOLIO_PATH, input, { skipErrorToast: true }),
    );
  },

  /** Slug cũ giữ 30 ngày để chuyển hướng. `PORT_001` trùng · `PORT_002` sai dạng · `PORT_003` từ cấm/dành riêng. */
  async changeSlug(slug: string, expectedVersion: number): Promise<Portfolio> {
    return unwrapData<Portfolio>(
      await apiClient.put(PORTFOLIO_SLUG_PATH, { expectedVersion, slug }, { skipErrorToast: true }),
    );
  },

  /** 60 lượt/phút/người dùng — nơi gọi debounce 500 ms. */
  async slugAvailable(slug: string): Promise<SlugAvailability> {
    return unwrapData<SlugAvailability>(
      await apiClient.get(PORTFOLIO_SLUG_AVAILABLE_PATH, {
        params: { slug },
        skipErrorToast: true,
      }),
    );
  },

  async templates(): Promise<PortfolioTemplateInfo[]> {
    return unwrapData<PortfolioTemplateInfo[]>(
      await apiClient.get(PORTFOLIO_TEMPLATES_PATH, { skipErrorToast: true }),
    );
  },

  /** 202 — dựng trang chạy NỀN; tiến độ qua socket `portfolio:build-updated` (dự phòng: `latestBuild`). */
  async publish(expectedVersion: number): Promise<PublishResult> {
    return unwrapData<PublishResult>(
      await apiClient.post(PORTFOLIO_PUBLISH_PATH, { expectedVersion }, { skipErrorToast: true }),
    );
  },

  async unpublish(): Promise<{ status: 'UNPUBLISHED' }> {
    return unwrapData<{ status: 'UNPUBLISHED' }>(
      await apiClient.post(PORTFOLIO_UNPUBLISH_PATH, undefined, { skipErrorToast: true }),
    );
  },

  /** `null` khi chưa dựng lần nào. */
  async latestBuild(): Promise<PortfolioBuild | null> {
    return unwrapData<PortfolioBuild | null>(
      await apiClient.get(PORTFOLIO_LATEST_BUILD_PATH, { skipErrorToast: true }),
    );
  },
};
