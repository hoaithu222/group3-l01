import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import { studySetHidePath, studySetUnhidePath } from './study.api';
import type { ModerationPayload, StudySetDetailDto } from './study.types';

/**
 * Ẩn/khôi phục bộ học của NHÓM (be `study-set-moderation.service.ts`, quyền OWNER/ADMIN nhóm — server tính vào `myPermissions.hide|unhide`).
 * Cả hai đều `POST` kèm `{ reason }` và trả `StudySetDetailDto` mới. `skipErrorToast`: lỗi (403 không đủ quyền, 404 bộ không còn thấy được,
 * 409 `STUDY_004` đã bị ẩn từ trước) hiện NGAY TRONG tấm xác nhận — người dùng còn đang giữ lý do vừa gõ, toast tự tắt sẽ làm mất ngữ cảnh.
 */
export const studyModerationService = {
  async hide(setId: string, payload: ModerationPayload): Promise<StudySetDetailDto> {
    const response = await apiClient.post<StudySetDetailDto>(studySetHidePath(setId), payload, {
      skipErrorToast: true,
    });
    return unwrapData<StudySetDetailDto>(response);
  },

  async unhide(setId: string, payload: ModerationPayload): Promise<StudySetDetailDto> {
    const response = await apiClient.post<StudySetDetailDto>(studySetUnhidePath(setId), payload, {
      skipErrorToast: true,
    });
    return unwrapData<StudySetDetailDto>(response);
  },
};
