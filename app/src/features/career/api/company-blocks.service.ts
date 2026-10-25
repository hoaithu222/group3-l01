import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import { COMPANY_BLOCKS_PATH, companyBlockPath, REPORTS_PATH } from './recruiter.api';
import type { BlockedCompany, ReportReason } from './recruiter.types';

/**
 * Chặn doanh nghiệp + báo cáo lời mời (p6-08). Chặn = biến mất khỏi tìm kiếm, không gửi được lời mời, thread cũ chỉ đọc; bỏ chặn KHÔNG mở lại
 * thread cũ (be.md §5). Cả hai chiều idempotent nên bấm hai lần không lỗi. `skipErrorToast`: lỗi hiện trong hộp thoại/tấm đang mở.
 */
export const companyBlocksService = {
  async list(): Promise<BlockedCompany[]> {
    return unwrapData<BlockedCompany[]>(
      await apiClient.get(COMPANY_BLOCKS_PATH, { skipErrorToast: true }),
    );
  },

  async block(companyId: string): Promise<void> {
    await apiClient.post(COMPANY_BLOCKS_PATH, { companyId }, { skipErrorToast: true });
  },

  async unblock(companyId: string): Promise<void> {
    await apiClient.delete(companyBlockPath(companyId), { skipErrorToast: true });
  },

  /** `POST /reports` (p1-08). Chỉ quản trị nền tảng xử lý đích `JOB_OFFER`; báo cáo lặp trả `alreadyReported`. */
  async reportOffer(
    offerId: string,
    reason: ReportReason,
    description?: string,
  ): Promise<{ alreadyReported: boolean }> {
    const response = await apiClient.post(
      REPORTS_PATH,
      { description, reason, targetId: offerId, targetType: 'JOB_OFFER' },
      { skipErrorToast: true },
    );
    return unwrapData<{ alreadyReported: boolean }>(response);
  },
};
