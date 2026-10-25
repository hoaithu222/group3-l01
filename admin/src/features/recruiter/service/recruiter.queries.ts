import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';

import { extractErrorCode } from '@/core/api/error.handler';
import { auditLogKeys } from '@/features/audit-log';
import { showToast } from '@/shared/utils/toast.utils';

import { COMPANY_ACTION_DONE, RECRUITER_ERROR } from '../constants/recruiter.constants';
import type { CompanyStatus } from '../types/company.types';
import type { AdminCompaniesParams, RecruiterStatsParams } from '../types/recruiter.types';
import { recruiterService } from './recruiter.service';

/** Query key vận hành p6-08 (admin.md §3) — cùng gốc `['recruiter']` để một lệnh làm mới cả danh sách, chi tiết và thống kê. */
export const recruiterKeys = {
  all: ['recruiter'] as const,
  /** Tiền tố — mọi bộ lọc/trang của danh sách. */
  companies: () => ['recruiter', 'companies'] as const,
  companyList: (p: AdminCompaniesParams) => ['recruiter', 'companies', p] as const,
  company: (id: string) => ['recruiter', 'company', id] as const,
  stats: (p: RecruiterStatsParams | undefined) => ['recruiter', 'stats', p ?? null] as const,
};

const codeOf = (err: unknown): string => extractErrorCode(err as AxiosError);

/** Làm mới danh sách + chi tiết + thống kê + nhật ký (mọi hành động vận hành đều ghi audit). */
export function refreshRecruiter(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: recruiterKeys.all });
  void qc.invalidateQueries({ queryKey: auditLogKeys.all });
}

/** `placeholderData: keepPreviousData` — đổi trang/lọc không nháy trắng bảng. `enabled` để chờ quyết định bộ lọc mặc định. */
export const useAdminCompanies = (params: AdminCompaniesParams, enabled = true) =>
  useQuery({
    queryKey: recruiterKeys.companyList(params),
    queryFn: () => recruiterService.list(params),
    placeholderData: keepPreviousData,
    enabled,
  });

/**
 * Số doanh nghiệp ở MỘT trạng thái (`limit=1`, chỉ đọc `meta.total`) — dùng cho KPI thống kê và bộ lọc mặc định "Chờ duyệt khi có".
 * Cùng khoá với danh sách nên hai nơi cùng hỏi "chờ duyệt" chỉ tốn MỘT lượt gọi.
 */
export const useCompanyStatusCount = (status: CompanyStatus, enabled = true) =>
  useQuery({
    queryKey: recruiterKeys.companyList({ page: 1, limit: 1, status }),
    queryFn: () => recruiterService.list({ page: 1, limit: 1, status }),
    select: (res) => res.meta?.total ?? 0,
    enabled,
  });

/** Số doanh nghiệp đang CHỜ DUYỆT — quyết định bộ lọc mặc định; chỉ chạy khi URL chưa chọn trạng thái nào (`enabled`). */
export const usePendingCompaniesCount = (enabled: boolean) =>
  useCompanyStatusCount('PENDING', enabled);

/** Chi tiết doanh nghiệp. 404 (không còn) không tự khỏi khi gọi lại — `retry: false` để vẽ trạng thái ngay. */
export const useAdminCompany = (companyId: string | undefined) =>
  useQuery({
    queryKey: recruiterKeys.company(companyId ?? ''),
    queryFn: () => recruiterService.detail(companyId as string),
    select: (res) => res.data,
    enabled: !!companyId,
    retry: false,
  });

/**
 * Duyệt / từ chối / tạm ngưng / khôi phục (`recruiter:approve`, lý do 10–500 + audit). `RECR_009` = người khác vừa đổi trạng thái —
 * làm mới để nút và nhãn khớp trạng thái thật thay vì kẹt hộp thoại với hành động không còn hợp lệ.
 */
export const useCompanyAction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: recruiterService.act,
    onSuccess: (_res, { action }) => {
      refreshRecruiter(qc);
      showToast('success', COMPANY_ACTION_DONE[action]);
    },
    onError: (err) => {
      if (codeOf(err) === RECRUITER_ERROR.invalidState) refreshRecruiter(qc);
    },
  });
};

/** PATCH đổi gói/hạn mức/thông tin (`recruiter:update`). `RES_003` = hồ sơ vừa đổi ở nơi khác → tải lại để có `version` mới. */
export const useCompanyPatch = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: recruiterService.patch,
    onSuccess: () => {
      refreshRecruiter(qc);
      showToast('success', 'Đã cập nhật doanh nghiệp và ghi nhật ký');
    },
    onError: (err) => {
      if (codeOf(err) === RECRUITER_ERROR.versionConflict) refreshRecruiter(qc);
    },
  });
};

/** `params` là `undefined` khi khoảng ngày sai — không gọi BE (BE chắc chắn trả 400). */
export const useRecruiterStats = (params: RecruiterStatsParams | undefined) =>
  useQuery({
    queryKey: recruiterKeys.stats(params),
    queryFn: () => recruiterService.stats(params as RecruiterStatsParams),
    select: (res) => res.data,
    placeholderData: keepPreviousData,
    enabled: !!params,
  });
