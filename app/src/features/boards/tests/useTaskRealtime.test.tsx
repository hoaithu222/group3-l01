import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { io } from 'socket.io-client';
import type { ReactNode } from 'react';

import { SocketEvent } from '@/core/socket';

import type { TaskCommentView, TaskDetailDto } from '../api/task-detail.types';
import { useTaskRealtime } from '../hooks/useTaskRealtime';
import { taskKeys } from '../queries/task-detail.keys';
import { flattenPages, type PagesData } from '../utils/comment-feed';
import { cardOf } from '../utils/task-detail-cache';
import { makeActivity, makeComment, makeDetail } from './detail-fixtures';

interface MockSocket {
  __emitServer: (event: string, payload?: unknown) => void;
}
const mockSocket = (io as jest.MockedFunction<typeof io>).mock.results[0]?.value as MockSocket;

const DETAIL_KEY = taskKeys.detail('t1');

function setup(detail: TaskDetailDto = makeDetail({ title: 'Cũ', version: 5 })) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
  queryClient.setQueryData(DETAIL_KEY, detail);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

const emit = (event: string, payload: unknown) => act(async () => mockSocket.__emitServer(event, payload));
const detailOf = (client: QueryClient) => client.getQueryData<TaskDetailDto>(DETAIL_KEY);

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('useTaskRealtime', () => {
  it('task:updated version CŨ hơn bị bỏ; version MỚI hơn trộn trường thẻ mini và giữ mô tả', async () => {
    const detail = makeDetail({ description: 'mô tả', title: 'Cũ', version: 5 });
    const { queryClient, wrapper } = setup(detail);
    await renderHook(() => useTaskRealtime('t1'), { wrapper });

    await emit(SocketEvent.TASK_UPDATED, {
      actorId: 'o',
      changed: ['title'],
      task: { ...cardOf(detail), title: 'Cũ hơn', version: 4 },
    });
    expect(detailOf(queryClient)?.title).toBe('Cũ');

    await emit(SocketEvent.TASK_UPDATED, {
      actorId: 'o',
      changed: ['title'],
      task: { ...cardOf(detail), title: 'Mới', version: 6 },
    });
    expect(detailOf(queryClient)).toMatchObject({ description: 'mô tả', title: 'Mới', version: 6 });
  });

  it('task:updated của thẻ KHÁC bị bỏ', async () => {
    const detail = makeDetail({ version: 5 });
    const { queryClient, wrapper } = setup(detail);
    await renderHook(() => useTaskRealtime('t1'), { wrapper });

    await emit(SocketEvent.TASK_UPDATED, {
      actorId: 'o',
      changed: ['title'],
      task: { ...cardOf(detail), id: 't-khác', title: 'Khác', version: 9 },
    });
    expect(detailOf(queryClient)?.title).toBe(detail.title);
  });

  it('checklist đổi (chỉ có ở chi tiết) ⇒ tải lại chi tiết, GỘP các cú dồn dập vào một lần (tick liền 10 mục)', async () => {
    const detail = makeDetail({ version: 5 });
    const { queryClient, wrapper } = setup(detail);
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    await renderHook(() => useTaskRealtime('t1'), { wrapper });

    for (let version = 6; version <= 10; version += 1) {
      await emit(SocketEvent.TASK_UPDATED, {
        actorId: 'o',
        changed: ['checklist', 'checklistDone', 'version'],
        task: { ...cardOf(detail), checklistDone: version - 5, version },
      });
    }
    expect(invalidate).not.toHaveBeenCalled();

    await act(async () => jest.advanceTimersByTime(1000));
    expect(invalidate.mock.calls.filter(([filters]) => JSON.stringify(filters?.queryKey) === JSON.stringify(DETAIL_KEY))).toHaveLength(1);
    expect(detailOf(queryClient)?.checklistDone).toBe(5);
  });

  it('task:activity: bình luận của người khác chèn đầu; tới hai lần vẫn một dòng; bản của mình khớp clientCommentId thay bản tạm', async () => {
    const { queryClient, wrapper } = setup();
    const own: TaskCommentView = {
      ...makeComment({ id: 'tmp_cm-1' }),
      clientCommentId: 'cm-1',
      localStatus: 'sending',
    };
    queryClient.setQueryData<PagesData<TaskCommentView>>(taskKeys.comments('t1'), {
      pageParams: [undefined],
      pages: [{ items: [own], nextCursor: null }],
    });
    await renderHook(() => useTaskRealtime('t1'), { wrapper });

    const other = makeComment({ id: 'c-other' });
    await emit(SocketEvent.TASK_ACTIVITY, { activity: { comment: other, type: 'COMMENT' }, taskId: 't1' });
    await emit(SocketEvent.TASK_ACTIVITY, { activity: { comment: other, type: 'COMMENT' }, taskId: 't1' });
    await emit(SocketEvent.TASK_ACTIVITY, {
      activity: { comment: makeComment({ clientCommentId: 'cm-1', id: 'real-1' }), type: 'COMMENT' },
      taskId: 't1',
    });

    const list = flattenPages(queryClient.getQueryData<PagesData<TaskCommentView>>(taskKeys.comments('t1')));
    expect(list.map((item) => item.id).sort()).toEqual(['c-other', 'real-1']);
    expect(list.every((item) => item.localStatus === undefined)).toBe(true);
  });

  it('task:activity thường được thêm vào nhật ký (nếu đã tải) và bỏ trùng id', async () => {
    const { queryClient, wrapper } = setup();
    queryClient.setQueryData(taskKeys.activity('t1'), {
      pageParams: [undefined],
      pages: [{ items: [makeActivity({ id: 'a1' })], nextCursor: null }],
    });
    await renderHook(() => useTaskRealtime('t1'), { wrapper });

    await emit(SocketEvent.TASK_ACTIVITY, { activity: makeActivity({ id: 'a2', type: 'RENAMED' }), taskId: 't1' });
    await emit(SocketEvent.TASK_ACTIVITY, { activity: makeActivity({ id: 'a2', type: 'RENAMED' }), taskId: 't1' });

    const items = flattenPages(
      queryClient.getQueryData<PagesData<ReturnType<typeof makeActivity>>>(taskKeys.activity('t1')),
    );
    expect(items.map((item) => item.id)).toEqual(['a2', 'a1']);
  });

  it('task:moved ghi cột mới vào chi tiết nếu version mới hơn', async () => {
    const { queryClient, wrapper } = setup(makeDetail({ version: 5 }));
    await renderHook(() => useTaskRealtime('t1'), { wrapper });

    await emit(SocketEvent.TASK_MOVED, {
      actorId: 'o',
      columnId: 'c_done',
      columnKind: 'DONE',
      completedAt: '2026-09-19T00:00:00.000Z',
      id: 't1',
      position: 'a0',
      version: 6,
    });
    expect(detailOf(queryClient)).toMatchObject({ columnId: 'c_done', columnKind: 'DONE', version: 6 });
  });
});
