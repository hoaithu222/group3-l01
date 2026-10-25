import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import { JOB_SETTINGS_PATH, SAVE_JOB_SETTINGS_PATH } from './recruiter.api';
import type { JobSettings, JobSettingsPayload } from './recruiter.types';

/**
 * Hồ sơ "Tìm việc" của sinh viên (p6-08): đọc `GET /me/career/job-settings`, ghi `PUT /me/career`. ⚠️ PUT ghi ĐỦ hồ sơ (không PATCH), nên nơi gọi luôn gửi
 * đủ `headline/preferredRoles/location`. Bật Open to work cần `consentVersion` khớp phiên bản chính sách HIỆN HÀNH (`VAL_001` nếu lệch); tắt thì không cần.
 * `skipErrorToast`: lỗi thuộc về màn (khôi phục công tắc + câu tiếng Việt đúng chỗ) — toast chung sẽ hiện thêm một lần nữa.
 */
export const jobSettingsService = {
  async get(): Promise<JobSettings> {
    return unwrapData<JobSettings>(
      await apiClient.get(JOB_SETTINGS_PATH, { skipErrorToast: true }),
    );
  },

  async update(payload: JobSettingsPayload): Promise<JobSettings> {
    return unwrapData<JobSettings>(
      await apiClient.put(SAVE_JOB_SETTINGS_PATH, payload, { skipErrorToast: true }),
    );
  },
};
