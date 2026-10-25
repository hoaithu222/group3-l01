import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import type {
  AccountNotificationPreference,
  UpdateAccountNotificationPreferencePayload,
  UpdateWorkspaceNotificationPreferencePayload,
  WorkspaceNotificationPreference,
} from './preferences.types';

/** `GET`/`PUT` cùng một đường dẫn. Không `scope` trong query = cấp tài khoản (BE p1-07). */
const PREFERENCES_PATH = '/me/notification-preferences';

/**
 * Tuỳ chọn thông báo cấp tài khoản (p0-06 `app.md` §4 "Preference"). Dùng chung cho màn Cài đặt
 * thông báo (p0-06) và các màn p1-07 — một nguồn, không mỗi feature tự gọi.
 */
export const notificationPreferencesService = {
  async getAccount(): Promise<AccountNotificationPreference> {
    const response = await apiClient.get<AccountNotificationPreference>(PREFERENCES_PATH);
    return unwrapData<AccountNotificationPreference>(response);
  },

  async updateAccount(
    payload: UpdateAccountNotificationPreferencePayload,
  ): Promise<AccountNotificationPreference> {
    const response = await apiClient.put<AccountNotificationPreference>(PREFERENCES_PATH, payload);
    return unwrapData<AccountNotificationPreference>(response);
  },

  /** Cài đặt của tôi cho MỘT nhóm làm việc (`groupMode`/`channelMode`, `INHERIT` = theo tài khoản). 404 nếu không phải thành viên. */
  async getWorkspace(workspaceId: string): Promise<WorkspaceNotificationPreference> {
    const response = await apiClient.get<WorkspaceNotificationPreference>(
      `/workspaces/${workspaceId}/notification-preferences`,
    );
    return unwrapData<WorkspaceNotificationPreference>(response);
  },

  async updateWorkspace(
    workspaceId: string,
    payload: UpdateWorkspaceNotificationPreferencePayload,
  ): Promise<WorkspaceNotificationPreference> {
    const response = await apiClient.put<WorkspaceNotificationPreference>(
      `/workspaces/${workspaceId}/notification-preferences`,
      payload,
    );
    return unwrapData<WorkspaceNotificationPreference>(response);
  },
};
