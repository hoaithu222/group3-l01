import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  roadmapEnrollPath,
  roadmapEnrollmentPath,
  roadmapLessonMediaPath,
  roadmapLessonPath,
  roadmapLessonProgressPath,
  roadmapReschedulePath,
  ROADMAP_SUBJECTS_PATH,
  roadmapSubjectPath,
  ROADMAP_TODAY_PATH,
} from './roadmap.api';
import type {
  RoadmapEnrollmentDto,
  RoadmapEnrollPayload,
  RoadmapLessonDto,
  RoadmapMediaDto,
  RoadmapPatchEnrollmentPayload,
  RoadmapProgressUpdateResultDto,
  RoadmapPutProgressPayload,
  RoadmapSubjectCardDto,
  RoadmapSubjectDetailDto,
  RoadmapTodayItemDto,
} from './roadmap.types';

/**
 * `skipErrorToast: true` ở MỌI hàm — lỗi (`RMAP_00x`, `RES_003`, 404 trung tính) là NỘI DUNG của màn (sheet đăng
 * ký, tab Tự kiểm tra…), không phải toast tự tắt; nơi gọi tự đọc `error` qua `toErrorMessage`/`roadmapErrorMessage`.
 */
export const roadmapService = {
  async subjects(): Promise<RoadmapSubjectCardDto[]> {
    const response = await apiClient.get<RoadmapSubjectCardDto[]>(ROADMAP_SUBJECTS_PATH, {
      skipErrorToast: true,
    });
    return unwrapData<RoadmapSubjectCardDto[]>(response);
  },

  /** `idOrSlug` — màn tổng quan mở bằng slug (từ `SubjectCard`) hoặc id (từ thẻ Hôm nay). */
  async subject(idOrSlug: string): Promise<RoadmapSubjectDetailDto> {
    const response = await apiClient.get<RoadmapSubjectDetailDto>(roadmapSubjectPath(idOrSlug), {
      skipErrorToast: true,
    });
    return unwrapData<RoadmapSubjectDetailDto>(response);
  },

  async enroll(
    subjectId: string,
    payload: RoadmapEnrollPayload,
    idempotencyKey: string,
  ): Promise<RoadmapEnrollmentDto> {
    const response = await apiClient.post<RoadmapEnrollmentDto>(
      roadmapEnrollPath(subjectId),
      payload,
      { headers: { 'Idempotency-Key': idempotencyKey }, skipErrorToast: true },
    );
    return unwrapData<RoadmapEnrollmentDto>(response);
  },

  async patchEnrollment(
    enrollmentId: string,
    payload: RoadmapPatchEnrollmentPayload,
  ): Promise<RoadmapEnrollmentDto> {
    const response = await apiClient.patch<RoadmapEnrollmentDto>(
      roadmapEnrollmentPath(enrollmentId),
      payload,
      { skipErrorToast: true },
    );
    return unwrapData<RoadmapEnrollmentDto>(response);
  },

  /** Dời lịch khi trễ (P1, be.md §6) — không có payload, chỉ `enrollmentId`; response giống `patchEnrollment`. */
  async reschedule(enrollmentId: string): Promise<RoadmapEnrollmentDto> {
    const response = await apiClient.post<RoadmapEnrollmentDto>(
      roadmapReschedulePath(enrollmentId),
      undefined,
      { skipErrorToast: true },
    );
    return unwrapData<RoadmapEnrollmentDto>(response);
  },

  async lesson(lessonId: string): Promise<RoadmapLessonDto> {
    const response = await apiClient.get<RoadmapLessonDto>(roadmapLessonPath(lessonId), {
      skipErrorToast: true,
    });
    return unwrapData<RoadmapLessonDto>(response);
  },

  async media(lessonId: string): Promise<RoadmapMediaDto[]> {
    const response = await apiClient.get<RoadmapMediaDto[]>(roadmapLessonMediaPath(lessonId), {
      skipErrorToast: true,
    });
    return unwrapData<RoadmapMediaDto[]>(response);
  },

  /** Gom checklist/tự đánh giá/ghi chú/đổi trạng thái vào MỘT lần gọi — gọi từ `useLessonProgress` (đã gom 800 ms). */
  async putProgress(
    lessonId: string,
    payload: RoadmapPutProgressPayload,
  ): Promise<RoadmapProgressUpdateResultDto> {
    const response = await apiClient.put<RoadmapProgressUpdateResultDto>(
      roadmapLessonProgressPath(lessonId),
      payload,
      { skipErrorToast: true },
    );
    return unwrapData<RoadmapProgressUpdateResultDto>(response);
  },

  async today(): Promise<RoadmapTodayItemDto[]> {
    const response = await apiClient.get<RoadmapTodayItemDto[]>(ROADMAP_TODAY_PATH, {
      skipErrorToast: true,
    });
    return unwrapData<RoadmapTodayItemDto[]>(response);
  },
};
