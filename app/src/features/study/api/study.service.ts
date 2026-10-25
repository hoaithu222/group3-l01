import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  STUDY_POPULAR_TAGS_PATH,
  STUDY_SETS_PATH,
  studySetDuplicatePath,
  studySetItemsPath,
  studySetPath,
  studySetReportPath,
  studyWorkspacePath,
} from './study.api';
import type {
  CreateSetPayload,
  CursorMeta,
  DuplicatePayload,
  ListSetsParams,
  PatchSetPayload,
  PopularTag,
  PutItemsPayload,
  PutItemsResult,
  ReportPayload,
  ReportResult,
  StudyItemDto,
  StudyItemsResult,
  StudySetDetailDto,
  StudySetPage,
  StudySetSummaryDto,
  WorkspaceAccess,
} from './study.types';

/**
 * `skipErrorToast` ở thao tác GHI: lỗi (`STUDY_001` theo mục, `STUDY_003/007/008`, `RES_003`) là NỘI DUNG của form/
 * màn soạn (giữ nguyên thứ người dùng đã nhập), không phải toast tự tắt sau 5 giây.
 */
export const studyService = {
  /** Đọc THẲNG `response.data` để giữ `meta` cursor. `q` < 2 ký tự bị BE từ chối nên bỏ trước khi gửi. */
  async list(
    params: ListSetsParams,
    cursor: string | undefined,
    limit = 30,
  ): Promise<StudySetPage> {
    const q = params.q?.trim();
    const response = await apiClient.get<{ data: StudySetSummaryDto[]; meta: CursorMeta }>(
      STUDY_SETS_PATH,
      {
        params: {
          scope: params.scope,
          workspaceId: params.workspaceId,
          q: q && q.length >= 2 ? q : undefined,
          tag: params.tag,
          cursor,
          limit,
        },
      },
    );
    return { items: response.data.data, meta: response.data.meta };
  },

  async create(payload: CreateSetPayload, idempotencyKey: string): Promise<StudySetDetailDto> {
    const response = await apiClient.post<StudySetDetailDto>(STUDY_SETS_PATH, payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
      skipErrorToast: true,
    });
    return unwrapData<StudySetDetailDto>(response);
  },

  async get(setId: string): Promise<StudySetDetailDto> {
    const response = await apiClient.get<StudySetDetailDto>(studySetPath(setId), {
      skipErrorToast: true,
    });
    return unwrapData<StudySetDetailDto>(response);
  },

  async patch(setId: string, payload: PatchSetPayload): Promise<StudySetDetailDto> {
    const response = await apiClient.patch<StudySetDetailDto>(studySetPath(setId), payload, {
      skipErrorToast: true,
    });
    return unwrapData<StudySetDetailDto>(response);
  },

  async remove(setId: string): Promise<void> {
    await apiClient.delete(studySetPath(setId));
  },

  /** Mặc định BE trả TOÀN BỘ (≤ 500) kèm đáp án; `meta.setVersion` = version bộ lúc đọc. */
  async items(setId: string): Promise<StudyItemsResult> {
    const response = await apiClient.get<{ data: StudyItemDto[]; meta?: { setVersion?: number } }>(
      studySetItemsPath(setId),
      { skipErrorToast: true },
    );
    return { items: response.data.data, setVersion: response.data.meta?.setVersion ?? null };
  },

  async putItems(setId: string, payload: PutItemsPayload): Promise<PutItemsResult> {
    const response = await apiClient.put<PutItemsResult>(studySetItemsPath(setId), payload, {
      skipErrorToast: true,
    });
    return unwrapData<PutItemsResult>(response);
  },

  async duplicate(
    setId: string,
    payload: DuplicatePayload,
    idempotencyKey: string,
  ): Promise<StudySetDetailDto> {
    const response = await apiClient.post<StudySetDetailDto>(
      studySetDuplicatePath(setId),
      payload,
      {
        headers: { 'Idempotency-Key': idempotencyKey },
        skipErrorToast: true,
      },
    );
    return unwrapData<StudySetDetailDto>(response);
  },

  async report(setId: string, payload: ReportPayload): Promise<ReportResult> {
    const response = await apiClient.post<ReportResult>(studySetReportPath(setId), payload, {
      skipErrorToast: true,
    });
    return unwrapData<ReportResult>(response);
  },

  async popularTags(workspaceId?: string): Promise<PopularTag[]> {
    const response = await apiClient.get<PopularTag[]>(STUDY_POPULAR_TAGS_PATH, {
      params: workspaceId ? { workspaceId } : undefined,
      skipErrorToast: true,
    });
    return unwrapData<PopularTag[]>(response);
  },

  async workspaceAccess(workspaceId: string): Promise<WorkspaceAccess> {
    const response = await apiClient.get<WorkspaceAccess>(studyWorkspacePath(workspaceId), {
      skipErrorToast: true,
    });
    return unwrapData<WorkspaceAccess>(response);
  },
};
