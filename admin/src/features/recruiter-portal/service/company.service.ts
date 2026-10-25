import { apiClient } from '@/core/api/client';
import type { RequestConfig } from '@/core/api/client.types';
import type { CompanyMemberView, CompanyUsage, CompanyView } from '@/features/recruiter';
import type { ApiResponse } from '@/shared/types/api.types';

import type {
  AddMemberPayload,
  CompanyDetail,
  MyCompany,
  RegisterCompanyPayload,
  RemoveMemberPayload,
  UpdateCompanyPayload,
} from '../types/portal.types';
import { portalApi } from './portal.api';

/**
 * Service THUẦN cho doanh nghiệp + nhân sự của cổng HR. `myCompany` tắt toast: 404 (chưa thuộc doanh nghiệp nào — `RES_001`) và 404 `CFG_005` (tính năng
 * chưa bật) là TRẠNG THÁI trang vẽ tại chỗ, không phải lỗi để toast. Hành động ghi để interceptor toast lỗi (`RECR_004` trùng tên/MST, `RECR_011`…).
 */
export const companyService = {
  myCompany: async (): Promise<ApiResponse<MyCompany>> =>
    (
      await apiClient.get<ApiResponse<MyCompany>>(portalApi.myCompany, {
        skipErrorToast: true,
      } as RequestConfig)
    ).data,

  register: async (body: RegisterCompanyPayload): Promise<ApiResponse<MyCompany>> =>
    (await apiClient.post<ApiResponse<MyCompany>>(portalApi.companies, body)).data,

  detail: async (companyId: string): Promise<ApiResponse<CompanyDetail>> =>
    (await apiClient.get<ApiResponse<CompanyDetail>>(portalApi.company(companyId))).data,

  update: async ({
    companyId,
    ...body
  }: UpdateCompanyPayload): Promise<ApiResponse<CompanyView>> =>
    (await apiClient.patch<ApiResponse<CompanyView>>(portalApi.company(companyId), body)).data,

  resubmit: async (companyId: string): Promise<ApiResponse<CompanyView>> =>
    (await apiClient.post<ApiResponse<CompanyView>>(portalApi.resubmit(companyId))).data,

  usage: async (companyId: string): Promise<ApiResponse<CompanyUsage>> =>
    (await apiClient.get<ApiResponse<CompanyUsage>>(portalApi.usage(companyId))).data,

  members: async (companyId: string): Promise<ApiResponse<CompanyMemberView[]>> =>
    (await apiClient.get<ApiResponse<CompanyMemberView[]>>(portalApi.members(companyId))).data,

  addMember: async ({
    companyId,
    ...body
  }: AddMemberPayload): Promise<ApiResponse<CompanyMemberView>> =>
    (
      await apiClient.post<ApiResponse<CompanyMemberView>>(portalApi.members(companyId), body)
    ).data,

  removeMember: async ({
    companyId,
    userId,
  }: RemoveMemberPayload): Promise<ApiResponse<{ removed: true }>> =>
    (
      await apiClient.delete<ApiResponse<{ removed: true }>>(
        portalApi.member(companyId, userId),
      )
    ).data,
};
