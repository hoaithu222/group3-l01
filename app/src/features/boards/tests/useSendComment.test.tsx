import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AxiosError } from 'axios';
import type { ReactNode } from 'react';

import { taskCommentsService } from '../api/task-comments.service';
import type { CreateCommentPayload, TaskCommentView, TaskDetailDto } from '../api/task-detail.types';
import { useSendComment } from '../queries/task-comments.queries';
import { taskKeys } from '../queries/task-detail.keys';
import { flattenPages, tempCommentId, type PagesData } from '../utils/comment-feed';
import { makeComment, makeDetail } from './detail-fixtures';
import { makeData } from './fixtures';
import { boardKeys } from '../queries/boards.keys';

// Thư viện thật là ESM thuần nên Jest không nạp được — xem tests/mocks/fractional-indexing.ts.
jest.mock('fractional-indexing', () => jest.requireActual('./mocks/fractional-indexing'));
jest.mock('@/shell/store/slices/auth', () => ({
  useAuthStore: (select: (state: unknown) => unknown) =>
    select({ user: { avatar: null, id: 'u-me', name: 'Tôi' } }),
}));
jest.mock('../api/task-comments.service', () => ({
  taskCommentsService: { create: jest.fn(), listActivity: jest.fn(), listComments: jest.fn(), mentionables: jest.fn(), remove: jest.fn(), update: jest.fn() },
}));

const create = taskCommentsService.create as jest.MockedFunction<typeof taskCommentsService.create>;
const KEY = taskKeys.comments('t1');
/** Cho phép mock của `create` chạm vào cache như một sự kiện socket tới giữa chừng. */
let queryClientRef: QueryClient | undefined;

const PAYLOAD: CreateCommentPayload = {
  attachmentAssetIds: [],
  clientCommentId: 'cm-12345678',
  content: 'Xong rồi @{u:' + 'b'.repeat(24) + '}',
  mentions: [{ targetId: 'b'.repeat(24), type: 'USER' }],
};
const VARIABLES = { mentions: [{ label: 'Minh', targetId: 'b'.repeat(24), type: 'USER' as const }], payload: PAYLOAD };

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { gcTime: Infinity, retry: false }, queries: { gcTime: Infinity, retry: false } },
  });
  queryClient.setQueryData(taskKeys.detail('t1'), makeDetail({ commentCount: 2 }));
  queryClient.setQueryData(boardKeys.tasks('b1', {}), makeData());
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

const comments = (client: QueryClient): TaskCommentView[] =>
  flattenPages(client.getQueryData<PagesData<TaskCommentView>>(KEY));

function failure(status: number, code: string, details?: unknown): AxiosError {
  return new AxiosError('lỗi', 'ERR_BAD_REQUEST', undefined, undefined, {
    config: {} as never,
    data: { error: { code, details } },
    headers: {},
    status,
    statusText: 'lỗi',
  });
}

beforeEach(() => jest.clearAllMocks());

describe('useSendComment', () => {
  it('chèn bản "Đang gửi" ngay, rồi thay bằng bản server khớp clientCommentId và tăng commentCount MỘT lần', async () => {
    let resolve: (value: ReturnType<typeof makeComment>) => void = () => undefined;
    create.mockReturnValue(new Promise((done) => (resolve = done)));
    const { queryClient, wrapper } = setup();
    const { result } = await renderHook(() => useSendComment('t1'), { wrapper });

    await act(async () => result.current.mutate(VARIABLES));
    await waitFor(() => expect(comments(queryClient)).toHaveLength(1));
    expect(comments(queryClient)[0]).toMatchObject({
      author: { id: 'u-me' },
      id: tempCommentId('cm-12345678'),
      localStatus: 'sending',
    });
    expect(create).toHaveBeenCalledWith('t1', PAYLOAD);

    resolve(makeComment({ clientCommentId: 'cm-12345678', id: 'real-1' }));
    await waitFor(() => expect(comments(queryClient)[0]?.id).toBe('real-1'));
    expect(comments(queryClient)).toHaveLength(1);
    expect(queryClient.getQueryData<TaskDetailDto>(taskKeys.detail('t1'))?.commentCount).toBe(3);
  });

  it('lỗi mạng ⇒ bản đó thành "failed" GIỮ payload; Thử lại dùng lại ĐÚNG clientCommentId (không tạo bản hai)', async () => {
    create.mockRejectedValueOnce(new Error('mạng'));
    const { queryClient, wrapper } = setup();
    const { result } = await renderHook(() => useSendComment('t1'), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync(VARIABLES)).rejects.toThrow();
    });
    const failed = comments(queryClient)[0];
    expect(failed).toMatchObject({ localStatus: 'failed', localPayload: PAYLOAD });

    create.mockResolvedValueOnce(makeComment({ clientCommentId: 'cm-12345678', id: 'real-2' }));
    await act(async () => {
      if (failed?.localPayload) result.current.mutate({ mentions: failed.mentions, payload: failed.localPayload });
    });
    await waitFor(() => expect(comments(queryClient)[0]?.id).toBe('real-2'));
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1]?.[1].clientCommentId).toBe('cm-12345678');
    expect(comments(queryClient)).toHaveLength(1);
  });

  it('TASK_014 (người được nhắc không thuộc nhóm) ⇒ GỠ bản tạm, không để bong bóng "lỗi" (nháp do composer giữ)', async () => {
    create.mockRejectedValue(failure(400, 'TASK_014', { invalidMentions: ['b'.repeat(24)] }));
    const { queryClient, wrapper } = setup();
    const { result } = await renderHook(() => useSendComment('t1'), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync(VARIABLES)).rejects.toBeInstanceOf(AxiosError);
    });

    expect(comments(queryClient)).toHaveLength(0);
    expect(queryClient.getQueryData<TaskDetailDto>(taskKeys.detail('t1'))?.commentCount).toBe(2);
  });

  it('socket tới TRƯỚC phản hồi HTTP (cùng clientCommentId) ⇒ không đếm commentCount hai lần', async () => {
    const real = makeComment({ clientCommentId: 'cm-12345678', id: 'real-3' });
    create.mockImplementation(async () => {
      // Giả lập `task:activity` của chính mình đã chèn bản thật trước khi HTTP trả về.
      queryClientRef?.setQueryData<PagesData<TaskCommentView>>(KEY, {
        pageParams: [undefined],
        pages: [{ items: [real], nextCursor: null }],
      });
      return real;
    });
    const { queryClient, wrapper } = setup();
    queryClientRef = queryClient;
    const { result } = await renderHook(() => useSendComment('t1'), { wrapper });

    await act(async () => result.current.mutate(VARIABLES));
    await waitFor(() => expect(create).toHaveBeenCalled());
    await act(async () => undefined);

    expect(queryClient.getQueryData<TaskDetailDto>(taskKeys.detail('t1'))?.commentCount).toBe(2);
  });
});
