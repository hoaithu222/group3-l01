import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { workspacesService } from '../api';
import type { TransferOwnerCandidate } from '../api';
import { useTransferCandidates } from '../hooks/useTransferCandidates';

jest.mock('../api', () => {
  const actual = jest.requireActual('../api');
  return { ...actual, workspacesService: { ...actual.workspacesService, listTransferCandidates: jest.fn() } };
});
const mockedList = jest.mocked(workspacesService.listTransferCandidates);

const CANDIDATE: TransferOwnerCandidate = {
  userId: 'u-1',
  name: 'Nguyễn Văn An',
  displayName: 'Anh An',
  avatarUrl: null,
  role: 'ADMIN',
  isMe: false,
};

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useTransferCandidates', () => {
  beforeEach(() => mockedList.mockReset());

  it('chưa mở sheet (enabled=false) ⇒ KHÔNG gọi API — thao tác hiếm, không tốn request mỗi lần vào màn cài đặt', async () => {
    await renderHook(() => useTransferCandidates('ws-1', false), { wrapper: createWrapper() });
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('mở sheet ⇒ tải một lần và đổi sang dạng của TransferOwnerSheet, tên hiện = displayName ?? name (chuỗi BE so với confirmName)', async () => {
    mockedList.mockResolvedValue([CANDIDATE, { ...CANDIDATE, userId: 'u-2', name: 'Trần Thị Bình', displayName: null }]);

    const { result } = await renderHook(() => useTransferCandidates('ws-1', true), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.members).toHaveLength(2));
    expect(mockedList).toHaveBeenCalledWith('ws-1', undefined);
    expect(result.current.members.map((member) => [member.id, member.name])).toEqual([
      ['u-1', 'Anh An'],
      ['u-2', 'Trần Thị Bình'],
    ]);
  });

  it('gõ tìm ⇒ gọi lại với q sau khi debounce, không bắn request cho từng ký tự', async () => {
    mockedList.mockResolvedValue([]);
    const { result } = await renderHook(() => useTransferCandidates('ws-1', true), { wrapper: createWrapper() });
    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(1));

    await act(async () => {
      result.current.setQuery('a');
      result.current.setQuery('an');
    });

    await waitFor(() => expect(mockedList).toHaveBeenCalledWith('ws-1', 'an'), { timeout: 2000 });
    expect(mockedList).not.toHaveBeenCalledWith('ws-1', 'a');
  });

  it('API lỗi ⇒ isError, danh sách rỗng (sheet hiện "Thử lại" chứ không phải "chưa có ai")', async () => {
    mockedList.mockRejectedValue(new Error('mất mạng'));

    const { result } = await renderHook(() => useTransferCandidates('ws-1', true), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.members).toEqual([]);
  });
});
