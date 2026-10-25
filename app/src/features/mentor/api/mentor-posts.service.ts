import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  MENTOR_POSTS_PATH,
  mentorApplicationActionPath,
  mentorPostApplicationsPath,
  mentorPostClosePath,
  mentorPostPath,
  mentorPostReportPath,
  MY_MENTOR_APPLICATIONS_PATH,
  workspaceMentorPostsPath,
} from './mentor.api';
import type {
  AcceptPayload,
  AcceptResult,
  ApplyPayload,
  CreateMentorPostPayload,
  CursorPage,
  MentorApplication,
  MentorApplicationStatus,
  MentorFeedFilter,
  MentorManagedPost,
  MentorPostCard,
  MentorPostDetail,
  MentorReportReason,
  MyMentorApplication,
} from './mentor.types';

const IDEMPOTENCY_HEADER = 'Idempotency-Key';

// ⚠️ Cursor: đọc `data` + `meta` ở gốc (`ResponseUtils.cursor`) — `unwrapData` vứt `meta`, mất `nextCursor`.
async function cursorList<T>(url: string, params: Record<string, unknown>): Promise<CursorPage<T>> {
  const response = await apiClient.get<{ data: T[]; meta: { nextCursor: string | null } }>(url, {
    params,
  });
  return { items: response.data.data, nextCursor: response.data.meta?.nextCursor ?? null };
}

/** Bài đăng + đơn ứng tuyển (be.md §4). Mutation bật `skipErrorToast` — màn tự hiện lỗi đúng chỗ (form/tấm/toast có nhánh). */
export const mentorPostsService = {
  feed(filter: MentorFeedFilter, cursor?: string, limit = 20): Promise<CursorPage<MentorPostCard>> {
    return cursorList<MentorPostCard>(MENTOR_POSTS_PATH, {
      cursor,
      limit,
      q: filter.q || undefined,
      skills: filter.skills?.length ? filter.skills.join(',') : undefined,
    });
  },

  async detail(postId: string): Promise<MentorPostDetail> {
    return unwrapData<MentorPostDetail>(
      await apiClient.get(mentorPostPath(postId), { skipErrorToast: true }),
    );
  },

  async workspacePosts(wsId: string): Promise<MentorManagedPost[]> {
    return unwrapData<MentorManagedPost[]>(
      await apiClient.get(workspaceMentorPostsPath(wsId), { skipErrorToast: true }),
    );
  },

  async create(
    wsId: string,
    payload: CreateMentorPostPayload,
    idempotencyKey: string,
  ): Promise<MentorPostDetail> {
    const response = await apiClient.post(workspaceMentorPostsPath(wsId), payload, {
      headers: { [IDEMPOTENCY_HEADER]: idempotencyKey },
      skipErrorToast: true,
    });
    return unwrapData<MentorPostDetail>(response);
  },

  async close(postId: string): Promise<MentorPostDetail> {
    return unwrapData<MentorPostDetail>(await apiClient.post(mentorPostClosePath(postId), {}));
  },

  async report(
    postId: string,
    reason: MentorReportReason,
    description?: string,
  ): Promise<{ alreadyReported: boolean }> {
    const response = await apiClient.post(
      mentorPostReportPath(postId),
      { description, reason },
      { skipErrorToast: true },
    );
    return unwrapData<{ alreadyReported: boolean }>(response);
  },

  async apply(
    postId: string,
    payload: ApplyPayload,
    idempotencyKey: string,
  ): Promise<MentorApplication> {
    const response = await apiClient.post(mentorPostApplicationsPath(postId), payload, {
      headers: { [IDEMPOTENCY_HEADER]: idempotencyKey },
      skipErrorToast: true,
    });
    return unwrapData<MentorApplication>(response);
  },

  postApplications(
    postId: string,
    status?: MentorApplicationStatus,
    cursor?: string,
  ): Promise<CursorPage<MentorApplication>> {
    return cursorList<MentorApplication>(mentorPostApplicationsPath(postId), {
      cursor,
      limit: 20,
      status,
    });
  },

  myApplications(cursor?: string): Promise<CursorPage<MyMentorApplication>> {
    return cursorList<MyMentorApplication>(MY_MENTOR_APPLICATIONS_PATH, { cursor, limit: 20 });
  },

  async withdraw(applicationId: string): Promise<MentorApplication> {
    return unwrapData<MentorApplication>(
      await apiClient.post(mentorApplicationActionPath(applicationId, 'withdraw'), {}),
    );
  },

  async reject(applicationId: string, reason?: string): Promise<MentorApplication> {
    const response = await apiClient.post(mentorApplicationActionPath(applicationId, 'reject'), {
      reason: reason || undefined,
    });
    return unwrapData<MentorApplication>(response);
  },

  /** `expectedPostVersion` bắt buộc (IR-22) + `Idempotency-Key` — 409 `MENTOR_005` do màn xử lý (toast + tải lại). */
  async accept(
    applicationId: string,
    payload: AcceptPayload,
    idempotencyKey: string,
  ): Promise<AcceptResult> {
    const response = await apiClient.post(
      mentorApplicationActionPath(applicationId, 'accept'),
      payload,
      {
        headers: { [IDEMPOTENCY_HEADER]: idempotencyKey },
        skipErrorToast: true,
      },
    );
    return unwrapData<AcceptResult>(response);
  },
};
