import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { io } from 'socket.io-client';

import { SocketEvent } from '@/core/socket';
import {
  savedKeys,
  savedMessagesService,
  useIsSavedMessage,
  useSaveActions,
  useSavedMessagesStore,
  useSavedSync,
} from '@/shared/saved';
import { showToast } from '@/shared/utils/toast.utils';

jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

interface MockSocket {
  __emitServer: (event: string, payload?: unknown) => void;
}
const mockSocket = (io as jest.MockedFunction<typeof io>).mock.results[0]?.value as MockSocket;

const saveSpy = jest.spyOn(savedMessagesService, 'save');
const unsaveSpy = jest.spyOn(savedMessagesService, 'unsave');

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { invalidate, wrapper };
}

const isSaved = (id: string) => useSavedMessagesStore.getState().ids[id] === true;

beforeEach(() => {
  jest.clearAllMocks();
  useSavedMessagesStore.getState().clear();
});

describe('saved.store — tập cờ "đã lưu" (MessageView chưa có isSaved)', () => {
  it('mark / markMany / clear; bỏ lưu id chưa có là không-op (giữ nguyên tham chiếu)', () => {
    const { mark, markMany } = useSavedMessagesStore.getState();
    markMany(['a', 'b']);
    mark('c', true);
    expect(Object.keys(useSavedMessagesStore.getState().ids).sort()).toEqual(['a', 'b', 'c']);

    const before = useSavedMessagesStore.getState().ids;
    mark('zzz', false);
    markMany(['a']);
    expect(useSavedMessagesStore.getState().ids).toBe(before);

    mark('b', false);
    expect(isSaved('b')).toBe(false);
    useSavedMessagesStore.getState().clear();
    expect(useSavedMessagesStore.getState().ids).toEqual({});
  });

  it('useIsSavedMessage theo id — đổi cờ thì hook vẽ lại', async () => {
    const { result } = await renderHook(() => useIsSavedMessage('m-1'));
    expect(result.current).toBe(false);

    await act(async () => useSavedMessagesStore.getState().mark('m-1', true));
    expect(result.current).toBe(true);
  });
});

describe('useSaveActions — lưu/bỏ lưu lạc quan + hoàn tác', () => {
  it('lưu: cờ bật NGAY (trước khi server trả lời), toast thành công, làm mới danh sách "Đã lưu"', async () => {
    let resolveSave: (value: { messageId: string; savedAt: string }) => void = () => undefined;
    saveSpy.mockReturnValue(new Promise((resolve) => (resolveSave = resolve)));
    const { invalidate, wrapper } = setup();
    const { result } = await renderHook(() => useSaveActions(), { wrapper });

    let pending: Promise<boolean> = Promise.resolve(false);
    await act(async () => {
      pending = result.current.setSaved('m-1', true);
    });
    expect(isSaved('m-1')).toBe(true);
    expect(showToast).not.toHaveBeenCalled();

    await act(async () => {
      resolveSave({ messageId: 'm-1', savedAt: '2026-09-19T00:00:00.000Z' });
      await pending;
    });
    expect(await pending).toBe(true);
    expect(showToast).toHaveBeenCalledWith('success', 'Đã lưu tin nhắn');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: savedKeys.all });
  });

  it('server từ chối (vd MSG_006 tin đã thu hồi): cờ QUAY LẠI như cũ, không toast thành công, trả false', async () => {
    saveSpy.mockRejectedValue(new Error('MSG_006'));
    const { invalidate, wrapper } = setup();
    const { result } = await renderHook(() => useSaveActions(), { wrapper });

    let ok = true;
    await act(async () => {
      ok = await result.current.setSaved('m-2', true);
    });

    expect(ok).toBe(false);
    expect(isSaved('m-2')).toBe(false);
    expect(showToast).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('bỏ lưu thất bại thì cờ "đã lưu" được khôi phục', async () => {
    useSavedMessagesStore.getState().mark('m-3', true);
    unsaveSpy.mockRejectedValue(new Error('mạng'));
    const { wrapper } = setup();
    const { result } = await renderHook(() => useSaveActions(), { wrapper });

    await act(async () => {
      await result.current.setSaved('m-3', false);
    });

    expect(isSaved('m-3')).toBe(true);
  });

  it('toggle đọc cờ HIỆN TẠI từ store (không phải closure cũ): chưa lưu → save, đã lưu → unsave', async () => {
    saveSpy.mockResolvedValue({ messageId: 'm-4', savedAt: '2026-09-19T00:00:00.000Z' });
    unsaveSpy.mockResolvedValue(undefined);
    const { wrapper } = setup();
    const { result } = await renderHook(() => useSaveActions(), { wrapper });

    await act(async () => {
      await result.current.toggle('m-4');
    });
    expect(saveSpy).toHaveBeenCalledWith('m-4');
    expect(isSaved('m-4')).toBe(true);

    await act(async () => {
      await result.current.toggle('m-4');
    });
    expect(unsaveSpy).toHaveBeenCalledWith('m-4');
    expect(isSaved('m-4')).toBe(false);
    expect(showToast).toHaveBeenLastCalledWith('success', 'Đã bỏ lưu tin nhắn');
  });
});

describe('useSavedSync — saved:updated (đa thiết bị)', () => {
  it('cập nhật cờ của tin + làm mới danh sách; chỉ tin trong sự kiện bị ảnh hưởng', async () => {
    useSavedMessagesStore.getState().mark('keep', true);
    const { invalidate, wrapper } = setup();
    await renderHook(() => useSavedSync(), { wrapper });

    await act(async () =>
      mockSocket.__emitServer(SocketEvent.SAVED_UPDATED, {
        v: 1,
        serverNow: '2026-09-19T00:00:00.000Z',
        messageId: 'm-5',
        saved: true,
      }),
    );
    expect(isSaved('m-5')).toBe(true);
    expect(isSaved('keep')).toBe(true);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: savedKeys.all });

    await act(async () =>
      mockSocket.__emitServer(SocketEvent.SAVED_UPDATED, {
        v: 1,
        serverNow: '2026-09-19T00:00:01.000Z',
        messageId: 'm-5',
        saved: false,
      }),
    );
    expect(isSaved('m-5')).toBe(false);
    expect(isSaved('keep')).toBe(true);
  });
});
