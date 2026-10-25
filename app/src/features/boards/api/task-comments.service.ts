import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  boardMentionablesPath,
  taskActivityPath,
  taskCommentPath,
  taskCommentsPath,
} from './task-detail.api';
import type {
  CreateCommentPayload,
  CursorPage,
  Mentionable,
  PatchCommentPayload,
  TaskActivityDto,
  TaskCommentDto,
} from './task-detail.types';
import { decodeComment } from '../utils/html-entities';

/** Số bản ghi mỗi trang activity/bình luận (app.md §4 "cursor 30"). */
export const FEED_PAGE_SIZE = 30;

/**
 * BE trả danh sách cursor dạng `{ data: T[], meta: { nextCursor } }` — đọc `response.data`
 * trực tiếp (không `unwrapData`) vì `data` ở đây là MẢNG bản ghi kèm `meta`, cùng lý do
 * `chatService.listReactors`.
 */
async function getPage<T>(url: string, cursor: string | undefined): Promise<CursorPage<T>> {
  const response = await apiClient.get<{ data: T[]; meta?: { nextCursor?: string | null } }>(url, {
    params: { cursor, limit: FEED_PAGE_SIZE },
  });
  return { items: response.data.data, nextCursor: response.data.meta?.nextCursor ?? null };
}

export const taskCommentsService = {
  listActivity(taskId: string, cursor?: string): Promise<CursorPage<TaskActivityDto>> {
    return getPage<TaskActivityDto>(taskActivityPath(taskId), cursor);
  },

  listComments(taskId: string, cursor?: string): Promise<CursorPage<TaskCommentDto>> {
    return getPage<TaskCommentDto>(taskCommentsPath(taskId), cursor).then((page) => ({
      ...page,
      items: page.items.map(decodeComment),
    }));
  },

  /**
   * `TASK_014 { invalidMentions }` do hook đọc để tô đỏ token nhắc tên — nên tắt toast tự động.
   * Gửi lại cùng `clientCommentId` BE trả lại bản cũ (200) thay vì tạo bản thứ hai.
   */
  async create(taskId: string, payload: CreateCommentPayload): Promise<TaskCommentDto> {
    const response = await apiClient.post<TaskCommentDto>(taskCommentsPath(taskId), payload, {
      skipErrorToast: true,
    });
    return decodeComment(unwrapData<TaskCommentDto>(response));
  },

  /** `TASK_015` (quá 15 phút) và `RES_003` được sheet sửa đọc từ `error` — tắt toast tự động. */
  async update(commentId: string, payload: PatchCommentPayload): Promise<TaskCommentDto> {
    const response = await apiClient.patch<TaskCommentDto>(taskCommentPath(commentId), payload, {
      skipErrorToast: true,
    });
    return decodeComment(unwrapData<TaskCommentDto>(response));
  },

  /** `reason` BẮT BUỘC khi xoá bình luận của người khác (OWNER/ADMIN, có audit — be.md §4). */
  async remove(commentId: string, reason?: string): Promise<void> {
    await apiClient.delete(taskCommentPath(commentId), { data: reason ? { reason } : undefined });
  },

  /** `≤ 20` thành viên MEMBER+ ACTIVE, không có email (be.md §4). Chỉ-đọc nên lỗi không toast. */
  async mentionables(boardId: string, q: string): Promise<Mentionable[]> {
    const response = await apiClient.get<Mentionable[]>(boardMentionablesPath(boardId), {
      params: { q: q || undefined },
      skipErrorToast: true,
    });
    return unwrapData<Mentionable[]>(response);
  },
};
