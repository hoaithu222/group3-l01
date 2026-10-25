import { apiClient } from '@/core/api/client';
import type { RequestConfig } from '@/core/api/client.types';
import type { ApiResponse } from '@/shared/types/api.types';

import type {
  AdminUser,
  AnonymizeResult,
  AnonymizeUserPayload,
  BiometricStatusFilter,
  ChangeRolePayload,
  CreateUserPayload,
  ReasonPayload,
  RemoveAvatarResult,
  UserBiometricCredential,
  UserListParams,
  UserSession,
} from '../types/user.types';
import { userApi } from './user.api';

/**
 * `skipErrorToast` cho create/lock/unlock/changeRole: 400/409 của các thao tác này dùng mã lỗi CHUNG
 * (`VAL_001`/`RES_002`) nên câu do interceptor dựng ("Tài nguyên đã tồn tại"…) không nói được điều gì sai —
 * hook toast câu đúng qua `resolveUserActionError` (`utils/user-errors.ts`).
 */
const OWN_ERROR_TOAST = { skipErrorToast: true } as RequestConfig;

/** Service THUẦN (async, không React) — hook React Query gọi qua đây. */
export const userService = {
  list: async (params: UserListParams): Promise<ApiResponse<AdminUser[]>> =>
    (await apiClient.get<ApiResponse<AdminUser[]>>(userApi.list, { params })).data,

  detail: async (id: string): Promise<ApiResponse<AdminUser>> =>
    (await apiClient.get<ApiResponse<AdminUser>>(userApi.detail(id))).data,

  create: async (payload: CreateUserPayload): Promise<ApiResponse<AdminUser>> =>
    (await apiClient.post<ApiResponse<AdminUser>>(userApi.create, payload, OWN_ERROR_TOAST)).data,

  lock: async ({ id, reason }: { id: string } & ReasonPayload): Promise<ApiResponse<AdminUser>> =>
    (await apiClient.post<ApiResponse<AdminUser>>(userApi.lock(id), { reason }, OWN_ERROR_TOAST))
      .data,

  unlock: async ({ id, reason }: { id: string } & ReasonPayload): Promise<ApiResponse<AdminUser>> =>
    (await apiClient.post<ApiResponse<AdminUser>>(userApi.unlock(id), { reason }, OWN_ERROR_TOAST))
      .data,

  changeRole: async ({
    id,
    role,
    reason,
  }: { id: string } & ChangeRolePayload): Promise<ApiResponse<AdminUser>> =>
    (
      await apiClient.patch<ApiResponse<AdminUser>>(
        userApi.changeRole(id),
        { role, reason },
        OWN_ERROR_TOAST,
      )
    ).data,

  sessions: async (id: string): Promise<ApiResponse<UserSession[]>> =>
    (await apiClient.get<ApiResponse<UserSession[]>>(userApi.sessions(id))).data,

  revokeSession: async ({
    id,
    sessionId,
  }: {
    id: string;
    sessionId: string;
  }): Promise<ApiResponse<null>> =>
    (await apiClient.delete<ApiResponse<null>>(userApi.revokeSession(id, sessionId))).data,

  anonymize: async ({
    id,
    ...payload
  }: { id: string } & AnonymizeUserPayload): Promise<ApiResponse<AnonymizeResult>> =>
    (await apiClient.post<ApiResponse<AnonymizeResult>>(userApi.anonymize(id), payload)).data,

  cancelAnonymize: async ({
    id,
    reason,
  }: { id: string } & ReasonPayload): Promise<ApiResponse<AnonymizeResult>> =>
    (await apiClient.post<ApiResponse<AnonymizeResult>>(userApi.anonymizeCancel(id), { reason }))
      .data,

  listBiometricCredentials: async (
    id: string,
    status: BiometricStatusFilter,
  ): Promise<ApiResponse<UserBiometricCredential[]>> =>
    (
      await apiClient.get<ApiResponse<UserBiometricCredential[]>>(
        userApi.biometricCredentials(id),
        {
          params: { status },
        },
      )
    ).data,

  revokeBiometricCredential: async ({
    id,
    credentialId,
    reason,
  }: {
    id: string;
    credentialId: string;
  } & ReasonPayload): Promise<ApiResponse<{ revoked: boolean }>> =>
    (
      await apiClient.post<ApiResponse<{ revoked: boolean }>>(
        userApi.biometricRevoke(id, credentialId),
        { reason },
      )
    ).data,

  /** Gỡ ảnh đại diện vi phạm — lỗi để interceptor toast (403/404…), `400` lý do gắn vào ô lý do của hộp thoại. */
  removeAvatar: async ({
    id,
    reason,
  }: { id: string } & ReasonPayload): Promise<ApiResponse<RemoveAvatarResult>> =>
    (await apiClient.post<ApiResponse<RemoveAvatarResult>>(userApi.removeAvatar(id), { reason }))
      .data,
};
