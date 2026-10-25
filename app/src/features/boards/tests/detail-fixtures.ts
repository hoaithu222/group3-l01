import type {
  ChecklistItemDto,
  TaskActivityDto,
  TaskCommentDto,
  TaskDetailDto,
} from '../api/task-detail.types';
import { makeTask } from './fixtures';

/** Mục checklist mẫu — `order` tăng dần theo id để dễ đọc thứ tự. */
export function makeItem(overrides: Partial<ChecklistItemDto> & Pick<ChecklistItemDto, 'id'>): ChecklistItemDto {
  return { done: false, order: Number(overrides.id.replace(/\D/g, '') || 0), text: `Việc ${overrides.id}`, ...overrides };
}

/** Chi tiết thẻ mẫu: thẻ `t1` có checklist 4 mục, đã tick 1. */
export function makeDetail(overrides: Partial<TaskDetailDto> = {}): TaskDetailDto {
  const checklist = [
    makeItem({ done: true, id: 'i1' }),
    makeItem({ id: 'i2' }),
    makeItem({ id: 'i3' }),
    makeItem({ id: 'i4' }),
  ];
  return {
    ...makeTask({ checklistDone: 1, checklistTotal: 4, id: 't1', title: 'Viết báo cáo' }),
    checklist,
    createdAt: '2026-09-01T00:00:00.000Z',
    createdBy: 'u-creator',
    description: null,
    labels: [],
    myPermissions: { attach: true, comment: true, delete: true, edit: true },
    startDate: null,
    ...overrides,
  };
}

export function makeComment(overrides: Partial<TaskCommentDto> & Pick<TaskCommentDto, 'id'>): TaskCommentDto {
  return {
    attachmentCount: 0,
    attachments: [],
    author: { avatarUrl: null, id: 'u-lan', name: 'Lan' },
    clientCommentId: `client-${overrides.id}`,
    content: 'Xong phần một rồi',
    createdAt: '2026-09-10T08:00:00.000Z',
    deletedAt: null,
    editedAt: null,
    mentions: [],
    taskId: 't1',
    version: 1,
    ...overrides,
  };
}

export function makeActivity(overrides: Partial<TaskActivityDto> & Pick<TaskActivityDto, 'id'>): TaskActivityDto {
  return {
    actor: { avatarUrl: null, id: 'u-lan', name: 'Lan' },
    after: null,
    at: '2026-09-10T09:00:00.000Z',
    before: null,
    taskId: 't1',
    type: 'CREATED',
    ...overrides,
  };
}
