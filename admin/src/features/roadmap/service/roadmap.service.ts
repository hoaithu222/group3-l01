import { apiClient } from '@/core/api/client';
import type { RequestConfig } from '@/core/api/client.types';
import type { ApiResponse } from '@/shared/types/api.types';

import type {
  AddMediaPayload,
  AdminLessonDetail,
  AdminPhase,
  AdminSubjectDetail,
  AdminSubjectRow,
  AdminSubjectsParams,
  CreateLessonPayload,
  CreatePhasePayload,
  CreateSubjectPayload,
  PatchLessonPayload,
  PatchMediaPayload,
  PatchPhasePayload,
  PatchSubjectPayload,
  PreviewResult,
  ReasonPayload,
  ReorderPayload,
  RoadmapAssetUrl,
  RoadmapMediaDto,
  StudySetOption,
} from '../types/roadmap.types';
import { roadmapApi } from './roadmap.api';

/** Service THUẦN cho admin Lộ trình học — lỗi ghi để interceptor toast như mọi hành động khác. */
export const roadmapService = {
  // ── Subject ──────────────────────────────────────────────────────────────
  listSubjects: async (params: AdminSubjectsParams): Promise<ApiResponse<AdminSubjectRow[]>> =>
    (await apiClient.get<ApiResponse<AdminSubjectRow[]>>(roadmapApi.subjects, { params })).data,

  /** 404 khi id sai/đã xoá — không toast (trang tự hiện Callout lỗi). */
  getSubject: async (id: string): Promise<ApiResponse<AdminSubjectDetail>> =>
    (
      await apiClient.get<ApiResponse<AdminSubjectDetail>>(roadmapApi.subject(id), {
        skipErrorToast: true,
      } as RequestConfig)
    ).data,

  createSubject: async ({
    idempotencyKey,
    ...body
  }: CreateSubjectPayload): Promise<ApiResponse<AdminSubjectDetail>> =>
    (
      await apiClient.post<ApiResponse<AdminSubjectDetail>>(roadmapApi.subjects, body, {
        headers: { 'Idempotency-Key': idempotencyKey },
      })
    ).data,

  patchSubject: async ({
    id,
    ...body
  }: PatchSubjectPayload): Promise<ApiResponse<AdminSubjectDetail>> =>
    (await apiClient.patch<ApiResponse<AdminSubjectDetail>>(roadmapApi.subject(id), body)).data,

  deleteSubject: async ({ id, reason }: ReasonPayload): Promise<void> => {
    await apiClient.delete(roadmapApi.subject(id), { data: { reason } });
  },

  publishSubject: async (id: string): Promise<ApiResponse<AdminSubjectDetail>> =>
    (await apiClient.post<ApiResponse<AdminSubjectDetail>>(roadmapApi.subjectPublish(id))).data,

  unpublishSubject: async ({ id, reason }: ReasonPayload): Promise<ApiResponse<AdminSubjectDetail>> =>
    (
      await apiClient.post<ApiResponse<AdminSubjectDetail>>(roadmapApi.subjectUnpublish(id), {
        reason,
      })
    ).data,

  archiveSubject: async ({ id, reason }: ReasonPayload): Promise<ApiResponse<AdminSubjectDetail>> =>
    (
      await apiClient.post<ApiResponse<AdminSubjectDetail>>(roadmapApi.subjectArchive(id), {
        reason,
      })
    ).data,

  reorder: async ({
    subjectId,
    ...body
  }: ReorderPayload): Promise<ApiResponse<AdminSubjectDetail>> =>
    (await apiClient.put<ApiResponse<AdminSubjectDetail>>(roadmapApi.subjectOrder(subjectId), body))
      .data,

  // ── Phase ────────────────────────────────────────────────────────────────
  createPhase: async ({
    subjectId,
    idempotencyKey,
    ...body
  }: CreatePhasePayload): Promise<ApiResponse<AdminPhase>> =>
    (
      await apiClient.post<ApiResponse<AdminPhase>>(roadmapApi.phases(subjectId), body, {
        headers: { 'Idempotency-Key': idempotencyKey },
      })
    ).data,

  patchPhase: async ({ id, ...body }: PatchPhasePayload): Promise<ApiResponse<AdminPhase>> =>
    (await apiClient.patch<ApiResponse<AdminPhase>>(roadmapApi.phase(id), body)).data,

  deletePhase: async ({ id, reason }: ReasonPayload): Promise<void> => {
    await apiClient.delete(roadmapApi.phase(id), { data: { reason } });
  },

  // ── Lesson ───────────────────────────────────────────────────────────────
  createLesson: async ({
    phaseId,
    idempotencyKey,
    ...body
  }: CreateLessonPayload): Promise<ApiResponse<AdminLessonDetail>> =>
    (
      await apiClient.post<ApiResponse<AdminLessonDetail>>(roadmapApi.lessons(phaseId), body, {
        headers: { 'Idempotency-Key': idempotencyKey },
      })
    ).data,

  getLesson: async (id: string): Promise<ApiResponse<AdminLessonDetail>> =>
    (
      await apiClient.get<ApiResponse<AdminLessonDetail>>(roadmapApi.lesson(id), {
        skipErrorToast: true,
      } as RequestConfig)
    ).data,

  patchLesson: async ({ id, ...body }: PatchLessonPayload): Promise<ApiResponse<AdminLessonDetail>> =>
    (await apiClient.patch<ApiResponse<AdminLessonDetail>>(roadmapApi.lesson(id), body)).data,

  deleteLesson: async ({ id, reason }: ReasonPayload): Promise<void> => {
    await apiClient.delete(roadmapApi.lesson(id), { data: { reason } });
  },

  publishLesson: async (id: string): Promise<ApiResponse<AdminLessonDetail>> =>
    (await apiClient.post<ApiResponse<AdminLessonDetail>>(roadmapApi.lessonPublish(id))).data,

  unpublishLesson: async (id: string): Promise<ApiResponse<AdminLessonDetail>> =>
    (await apiClient.post<ApiResponse<AdminLessonDetail>>(roadmapApi.lessonUnpublish(id))).data,

  /** `POST /admin/roadmap/preview` — chỉ đọc, không lưu; `RMAP_002` khi nội dung không dựng được. */
  preview: async (bodyMd: string): Promise<ApiResponse<PreviewResult>> =>
    (
      await apiClient.post<ApiResponse<PreviewResult>>(
        roadmapApi.preview,
        { bodyMd },
        { skipErrorToast: true } as RequestConfig,
      )
    ).data,

  // ── Media ────────────────────────────────────────────────────────────────
  addMedia: async ({
    lessonId,
    ...body
  }: AddMediaPayload): Promise<ApiResponse<RoadmapMediaDto>> =>
    (await apiClient.post<ApiResponse<RoadmapMediaDto>>(roadmapApi.lessonMedia(lessonId), body)).data,

  patchMedia: async ({ id, ...body }: PatchMediaPayload): Promise<ApiResponse<RoadmapMediaDto>> =>
    (await apiClient.patch<ApiResponse<RoadmapMediaDto>>(roadmapApi.media(id), body)).data,

  deleteMedia: async (id: string): Promise<void> => {
    await apiClient.delete(roadmapApi.media(id));
  },

  /** URL ký của ảnh/asset (kind `ASSET`). Lỗi (chưa sẵn sàng/không đọc được) không toast — thẻ tự rơi về icon placeholder. */
  assetUrl: async (assetId: string): Promise<RoadmapAssetUrl> =>
    (
      await apiClient.get<ApiResponse<RoadmapAssetUrl>>(roadmapApi.assetUrl(assetId), {
        skipErrorToast: true,
      } as RequestConfig)
    ).data.data,

  /**
   * `GET /study-sets?scope=public&q=` (endpoint người dùng chung — xem `roadmapApi.studySetsSearch`).
   * `q` < 2 ký tự bị BE từ chối (`listSetsQuerySchema.q` min 2) nên bỏ qua khi ngắn hơn.
   */
  searchPublicStudySets: async (q: string): Promise<ApiResponse<StudySetOption[]>> =>
    (
      await apiClient.get<ApiResponse<StudySetOption[]>>(roadmapApi.studySetsSearch, {
        params: { scope: 'public', limit: 20, ...(q.trim().length >= 2 && { q: q.trim() }) },
        skipErrorToast: true,
      } as RequestConfig)
    ).data,
};

/** Khoá idempotency cho một Ý ĐỊNH tạo mới — sinh MỘT lần khi mount modal/trang tạo (giữ khi thử lại sau lỗi mạng). */
export function newRoadmapIdempotencyKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

/**
 * Order float mới chèn GIỮA hai lân cận (`ORDER_STEP` 1024 như `study-item-order.ts`, be.md §5.5) — dùng
 * khi kéo-thả một dòng vào vị trí mới, chỉ gửi ĐÚNG dòng vừa di chuyển trong `reorderSchema`.
 */
const ORDER_STEP = 1024;
export function computeOrderBetween(prev: number | undefined, next: number | undefined): number {
  if (prev == null && next == null) return ORDER_STEP;
  if (prev == null) return (next as number) / 2;
  if (next == null) return prev + ORDER_STEP;
  return (prev + next) / 2;
}
