import { apiClient } from '@/core/api/client';
import type { RequestConfig } from '@/core/api/client.types';
import type { ApiResponse } from '@/shared/types/api.types';

import type { CompanyView } from '../types/company.types';
import type {
  AdminCompaniesParams,
  AdminCompanyDetail,
  AdminCompanyItem,
  CompanyActionPayload,
  CompanyPatchPayload,
  RecruiterStats,
  RecruiterStatsParams,
} from '../types/recruiter.types';
import { recruiterApi } from './recruiter.api';

/**
 * Service THUẦN cho vận hành doanh nghiệp. `detail` tắt toast: 404 (doanh nghiệp không còn) là TRẠNG THÁI ngăn kéo vẽ tại chỗ;
 * hành động ghi để interceptor toast lỗi như mọi thao tác quản trị khác.
 */
export const recruiterService = {
  list: async (params: AdminCompaniesParams): Promise<ApiResponse<AdminCompanyItem[]>> =>
    (await apiClient.get<ApiResponse<AdminCompanyItem[]>>(recruiterApi.companies, { params })).data,

  detail: async (companyId: string): Promise<ApiResponse<AdminCompanyDetail>> =>
    (
      await apiClient.get<ApiResponse<AdminCompanyDetail>>(recruiterApi.company(companyId), {
        skipErrorToast: true,
      } as RequestConfig)
    ).data,

  act: async ({ companyId, action, reason }: CompanyActionPayload): Promise<ApiResponse<CompanyView>> =>
    (
      await apiClient.post<ApiResponse<CompanyView>>(recruiterApi.action(companyId, action), {
        reason,
      })
    ).data,

  patch: async ({ companyId, ...body }: CompanyPatchPayload): Promise<ApiResponse<CompanyView>> =>
    (await apiClient.patch<ApiResponse<CompanyView>>(recruiterApi.company(companyId), body)).data,

  stats: async (params: RecruiterStatsParams): Promise<ApiResponse<RecruiterStats>> =>
    (await apiClient.get<ApiResponse<RecruiterStats>>(recruiterApi.stats, { params })).data,
};
