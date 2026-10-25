import { apiClient } from '@/core/api/client';
import type { RequestConfig } from '@/core/api/client.types';
import type { ApiResponse } from '@/shared/types/api.types';

import type {
  AdminSkill,
  AdminSkillProof,
  AdminSkillsParams,
  AdminUserSkillRow,
  CreateSkillPayload,
  EligiblePreview,
  LabelSuggestion,
  ReevaluateResult,
  SkillCriteria,
  UpdateSkillPayload,
} from '../types/skill.types';
import { skillApi } from './skill.api';

interface ReasonArgs {
  reason: string;
}

interface UserSkillArgs extends ReasonArgs {
  userId: string;
  skillId: string;
}

/** Service THUẦN cho admin kỹ năng — lỗi ghi để interceptor toast như mọi hành động khác. */
export const skillService = {
  list: async (params: AdminSkillsParams): Promise<ApiResponse<AdminSkill[]>> =>
    (await apiClient.get<ApiResponse<AdminSkill[]>>(skillApi.skills, { params })).data,

  /** 404 khi id sai/đã xoá — trang tự hiện trạng thái lỗi, không toast. */
  get: async (id: string): Promise<ApiResponse<AdminSkill>> =>
    (
      await apiClient.get<ApiResponse<AdminSkill>>(skillApi.skill(id), {
        skipErrorToast: true,
      } as RequestConfig)
    ).data,

  create: async (body: CreateSkillPayload): Promise<ApiResponse<AdminSkill>> =>
    (await apiClient.post<ApiResponse<AdminSkill>>(skillApi.skills, body)).data,

  update: async ({
    id,
    ...body
  }: UpdateSkillPayload): Promise<ApiResponse<AdminSkill & { criteriaHarder: boolean }>> =>
    (
      await apiClient.patch<ApiResponse<AdminSkill & { criteriaHarder: boolean }>>(
        skillApi.skill(id),
        body,
      )
    ).data,

  setActive: async ({
    id,
    active,
    reason,
  }: { id: string; active: boolean } & ReasonArgs): Promise<ApiResponse<AdminSkill>> =>
    (
      await apiClient.post<ApiResponse<AdminSkill>>(
        active ? skillApi.activate(id) : skillApi.deactivate(id),
        { reason },
      )
    ).data,

  /** Xem trước chỉ đọc — lỗi (vd tiêu chí đang gõ dở không hợp lệ `SKILL_002`) KHÔNG toast; bảng xem trước tự báo. */
  preview: async (id: string, criteria?: SkillCriteria): Promise<ApiResponse<EligiblePreview>> =>
    (
      await apiClient.get<ApiResponse<EligiblePreview>>(skillApi.preview(id), {
        params: criteria ? { criteria: JSON.stringify(criteria) } : undefined,
        skipErrorToast: true,
      } as RequestConfig)
    ).data,

  labelSuggestions: async (q: string): Promise<ApiResponse<LabelSuggestion[]>> =>
    (
      await apiClient.get<ApiResponse<LabelSuggestion[]>>(skillApi.labelSuggestions, {
        params: { q },
      })
    ).data,

  reevaluate: async ({ reason }: ReasonArgs): Promise<ApiResponse<ReevaluateResult>> =>
    (await apiClient.post<ApiResponse<ReevaluateResult>>(skillApi.reevaluate, { reason })).data,

  userSkills: async (userId: string): Promise<ApiResponse<AdminUserSkillRow[]>> =>
    (await apiClient.get<ApiResponse<AdminUserSkillRow[]>>(skillApi.userSkills(userId))).data,

  userProof: async (userId: string, skillId: string): Promise<ApiResponse<AdminSkillProof>> =>
    (await apiClient.get<ApiResponse<AdminSkillProof>>(skillApi.userProof(userId, skillId))).data,

  revoke: async ({ userId, skillId, reason }: UserSkillArgs): Promise<void> => {
    await apiClient.post(skillApi.revoke(userId, skillId), { reason });
  },

  restore: async ({ userId, skillId, reason }: UserSkillArgs): Promise<void> => {
    await apiClient.post(skillApi.restore(userId, skillId), { reason });
  },
};
