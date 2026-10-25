import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AxiosError } from 'axios';
import type { ReactNode } from 'react';

import { taskCommentsService } from '../api/task-comments.service';
import { useCommentComposer } from '../hooks/useCommentComposer';
import { draftKeyOf, useTaskDraftStore } from '../store/task-comment-drafts.store';
import { makeComment, makeDetail } from './detail-fixtures';
import { taskKeys } from '../queries/task-detail.keys';

// Thư viện thật là ESM thuần nên Jest không nạp được — xem tests/mocks/fractional-indexing.ts.
jest.mock('fractional-indexing', () => jest.requireActual('./mocks/fractional-indexing'));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('@/shell/store/slices/auth', () => ({
  useAuthStore: (select: (state: unknown) => unknown) =>
    select({ user: { avatar: null, id: 'u-me', name: 'Tôi' } }),
}));
jest.mock('../api/task-comments.service', () => ({
  taskCommentsService: { create: jest.fn(), mentionables: jest.fn() },
}));

const create = taskCommentsService.create as jest.MockedFunction<typeof taskCommentsService.create>;
const MINH = 'b'.repeat(24);
const KEY = draftKeyOf('u-me', 't1');

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { gcTime: Infinity, retry: false }, queries: { gcTime: Infinity, retry: false } },
  });
  queryClient.setQueryData(taskKeys.detail('t1'), makeDetail());
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return wrapper;
}

function taskInvalidMentions(): AxiosError {
  return new AxiosError('lỗi', 'ERR_BAD_REQUEST', undefined, undefined, {
    config: {} as never,
    data: { error: { code: 'TASK_014', details: { invalidMentions: [MINH] } } },
    headers: {},
    status: 400,
    statusText: 'lỗi',
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useTaskDraftStore.setState({ drafts: {} });
});

describe('useCommentComposer', () => {
  it('gửi: content có marker @{u:id}, mentions[] khử trùng, nháp bị xoá và clientCommentId 8–64 ký tự', async () => {
    create.mockResolvedValue(makeComment({ id: 'real' }));
    useTaskDraftStore.getState().setDraft(KEY, { picks: [{ label: 'Minh', userId: MINH }], text: 'Nhờ @Minh xem giúp' });
    const { result } = await renderHook(() => useCommentComposer({ boardId: 'b1', canComment: true, taskId: 't1' }), {
      wrapper: setup(),
    });
    expect(result.current.canSend).toBe(true);

    await act(async () => result.current.send());

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const payload = create.mock.calls[0]?.[1];
    expect(payload).toMatchObject({
      attachmentAssetIds: [],
      content: `Nhờ @{u:${MINH}} xem giúp`,
      mentions: [{ targetId: MINH, type: 'USER' }],
    });
    expect(payload?.clientCommentId.length).toBeGreaterThanOrEqual(8);
    expect(payload?.clientCommentId.length).toBeLessThanOrEqual(64);
    expect(useTaskDraftStore.getState().drafts[KEY]).toBeUndefined();
  });

  it('PM2-16: TASK_014 ⇒ nháp được GIỮ LẠI, người bị từ chối bị tô đỏ và Gửi bị chặn tới khi bỏ họ khỏi câu', async () => {
    create.mockRejectedValue(taskInvalidMentions());
    const draft = { picks: [{ label: 'Minh', userId: MINH }], text: 'Nhờ @Minh xem giúp' };
    useTaskDraftStore.getState().setDraft(KEY, draft);
    const { result } = await renderHook(() => useCommentComposer({ boardId: 'b1', canComment: true, taskId: 't1' }), {
      wrapper: setup(),
    });

    await act(async () => result.current.send());

    await waitFor(() => expect(result.current.invalidLabels).toEqual(['Minh']));
    expect(useTaskDraftStore.getState().drafts[KEY]).toEqual(draft);
    expect(result.current.draft.text).toBe('Nhờ @Minh xem giúp');
    expect(result.current.canSend).toBe(false);

    // Người dùng xoá lời nhắc khỏi câu ⇒ hết chặn.
    await act(async () => result.current.mention.changeText('Nhờ xem giúp'));
    expect(result.current.invalidLabels).toEqual([]);
    expect(result.current.canSend).toBe(true);
  });

  it('không gửi được khi rỗng, và khi không có quyền bình luận (offline/lưu trữ)', async () => {
    const wrapper = setup();
    const empty = await renderHook(() => useCommentComposer({ boardId: 'b1', canComment: true, taskId: 't1' }), { wrapper });
    expect(empty.result.current.canSend).toBe(false);

    await act(async () => useTaskDraftStore.getState().setDraft(KEY, { picks: [], text: 'có chữ' }));
    const blocked = await renderHook(() => useCommentComposer({ boardId: 'b1', canComment: false, taskId: 't1' }), { wrapper });
    expect(blocked.result.current.canSend).toBe(false);
    await act(async () => blocked.result.current.send());
    expect(create).not.toHaveBeenCalled();
  });

  it('vượt 4000 ký tự SAU khi thay @Tên bằng marker dài hơn thì chặn gửi', async () => {
    // 3980 chữ + dấu cách + "@Minh" (5) = 3986 ký tự HIỂN THỊ, nhưng marker `@{u:<24 hex>}` dài 29 ⇒ 4010 > 4000 khi gửi.
    useTaskDraftStore.getState().setDraft(KEY, {
      picks: [{ label: 'Minh', userId: MINH }],
      text: `${'a'.repeat(3980)} @Minh`,
    });
    const { result } = await renderHook(() => useCommentComposer({ boardId: 'b1', canComment: true, taskId: 't1' }), {
      wrapper: setup(),
    });
    expect(result.current.length).toBe(3980 + 1 + `@{u:${MINH}}`.length);
    expect(result.current.overLimit).toBe(true);
    expect(result.current.canSend).toBe(false);
  });
});
